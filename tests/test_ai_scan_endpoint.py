"""Tests for the AI scan endpoint with a stubbed Home Assistant.

The endpoint is the only place that talks to ``ai_task``. A wrong keyword, a
forgotten cleanup or an attachment that points nowhere would otherwise only
show up on a real installation, so Home Assistant and aiohttp are replaced by
small stand-ins here.

Run with: python3 -m unittest tests.test_ai_scan_endpoint
"""

from __future__ import annotations

import enum
import io
import json
import sys
import types
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

BASE = Path(__file__).resolve().parents[1]
COMPONENT = BASE / "custom_components" / "recipe_box"
sys.path.insert(0, str(BASE / "custom_components"))


class FakeResponse:
    """Stand-in for the response a Home Assistant view returns."""

    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self.payload = payload
        self.status_code = status_code


class HomeAssistantView:
    """Stand-in for homeassistant.components.http.HomeAssistantView."""

    requires_auth = True

    def json(self, payload: dict, status_code: int = 200) -> FakeResponse:
        return FakeResponse(payload, status_code)

    def json_message(
        self, message: str, status_code: int = 200, error_code: str | None = None
    ) -> FakeResponse:
        return FakeResponse({"message": message}, status_code)


class AITaskEntityFeature(enum.IntFlag):
    """Stand-in for the real feature flags of an AI task entity."""

    GENERATE_DATA = 1
    SUPPORT_ATTACHMENTS = 2
    GENERATE_IMAGE = 4
    EVALUATE = 8


DATA_COMPONENT = "ai_task_component"
DATA_PREFERENCES = "ai_task_preferences"
KEY_HASS = "hass"


def _install_stubs() -> None:
    """Install the Home Assistant and aiohttp modules the endpoint imports."""
    if "homeassistant" in sys.modules:
        return

    ha = types.ModuleType("homeassistant")
    ha.__path__ = []

    const = types.ModuleType("homeassistant.const")

    class Platform:
        SENSOR = "sensor"
        BUTTON = "button"

    const.Platform = Platform

    core = types.ModuleType("homeassistant.core")

    class Context:
        def __init__(self, user_id: str | None = None) -> None:
            self.user_id = user_id

    class HomeAssistant:
        pass

    core.HomeAssistant = HomeAssistant
    core.Context = Context
    core.callback = lambda func: func

    exceptions = types.ModuleType("homeassistant.exceptions")

    class HomeAssistantError(Exception):
        pass

    exceptions.HomeAssistantError = HomeAssistantError

    components = types.ModuleType("homeassistant.components")
    components.__path__ = []

    http = types.ModuleType("homeassistant.components.http")
    http.KEY_HASS = KEY_HASS
    http.HomeAssistantView = HomeAssistantView

    ai_task = types.ModuleType("homeassistant.components.ai_task")
    ai_task.__path__ = []
    ai_task.AITaskEntityFeature = AITaskEntityFeature

    async def async_generate_data(*args, **kwargs):
        raise AssertionError("no AI call expected")

    ai_task.async_generate_data = async_generate_data

    ai_task_const = types.ModuleType("homeassistant.components.ai_task.const")
    ai_task_const.DATA_COMPONENT = DATA_COMPONENT
    ai_task_const.DATA_PREFERENCES = DATA_PREFERENCES

    aiohttp = types.ModuleType("aiohttp")
    web = types.ModuleType("aiohttp.web")

    class Request:
        pass

    class HTTPRequestEntityTooLarge(Exception):
        pass

    web.Request = Request
    web.Response = FakeResponse
    web.HTTPRequestEntityTooLarge = HTTPRequestEntityTooLarge
    aiohttp.web = web

    ha.const = const
    ha.core = core
    ha.exceptions = exceptions
    ha.components = components

    sys.modules.update(
        {
            "homeassistant": ha,
            "homeassistant.const": const,
            "homeassistant.core": core,
            "homeassistant.exceptions": exceptions,
            "homeassistant.components": components,
            "homeassistant.components.http": http,
            "homeassistant.components.ai_task": ai_task,
            "homeassistant.components.ai_task.const": ai_task_const,
            "aiohttp": aiohttp,
            "aiohttp.web": web,
        }
    )


_install_stubs()

if "recipe_box" not in sys.modules:  # pragma: no cover - import guard
    package = types.ModuleType("recipe_box")
    package.__path__ = [str(COMPONENT)]
    sys.modules["recipe_box"] = package

from recipe_box import ai_scan  # noqa: E402
from recipe_box.ai_scan import AiScanError, AiScanView  # noqa: E402

AI_TASK = sys.modules["homeassistant.components.ai_task"]
HOME_ASSISTANT_ERROR = sys.modules["homeassistant.exceptions"].HomeAssistantError
CONTEXT = sys.modules["homeassistant.core"].Context

RECIPE = {
    "title": "Apfelkuchen",
    "servings": 8,
    "ingredients": ["4 Äpfel", "200 g Mehl"],
    "instructions": ["Äpfel schälen.", "Backen."],
}


class FakeEntity:
    def __init__(self, entity_id: str, features) -> None:
        self.entity_id = entity_id
        self.supported_features = features


class FakeStates:
    def __init__(self, entities: list[FakeEntity]) -> None:
        self._entities = entities

    def async_entity_ids(self, domain: str | None = None) -> list[str]:
        return [
            entity.entity_id
            for entity in self._entities
            if domain is None or entity.entity_id.startswith(f"{domain}.")
        ]


class FakeComponent:
    def __init__(self, entities: list[FakeEntity]) -> None:
        self._entities = {entity.entity_id: entity for entity in entities}

    def get_entity(self, entity_id: str):
        return self._entities.get(entity_id)


class FakeHttp:
    def __init__(self) -> None:
        self.views = []

    def register_view(self, view) -> None:
        self.views.append(view)


class FakeConfig:
    def __init__(self, media_dirs: dict[str, str]) -> None:
        self.media_dirs = media_dirs


class FakeHass:
    def __init__(
        self,
        media_dirs: dict[str, str] | None = None,
        entities: list[FakeEntity] | None = None,
    ) -> None:
        self.data = {}
        self.states = FakeStates(entities or [])
        self.config = FakeConfig(media_dirs or {})
        self.http = FakeHttp()
        if entities:
            self.data[DATA_COMPONENT] = FakeComponent(entities)

    async def async_add_executor_job(self, func, *args):
        return func(*args)


def vision_entity(entity_id: str = "ai_task.gemini") -> FakeEntity:
    return FakeEntity(
        entity_id,
        AITaskEntityFeature.GENERATE_DATA | AITaskEntityFeature.SUPPORT_ATTACHMENTS,
    )


class FakeField:
    """Stand-in for the FileField aiohttp returns for an uploaded file."""

    def __init__(self, content: bytes, content_type: str = "image/jpeg") -> None:
        self.file = io.BytesIO(content)
        self.content_type = content_type


class FakePost:
    def __init__(self, files: list[FakeField], extra: dict | None = None) -> None:
        self._files = files
        self._extra = extra or {}

    def getall(self, key: str, default=None):
        return self._files if key == "file" else default

    def get(self, key: str, default=None):
        return self._extra.get(key, default)


class FakeRequest:
    def __init__(
        self,
        hass: FakeHass,
        files: list[FakeField] | None = None,
        extra: dict | None = None,
        user: object = None,
    ) -> None:
        self.app = {KEY_HASS: hass}
        self._post = FakePost(files or [], extra)
        self._user = SimpleNamespace(id="user-1") if user is None else user
        self._client_max_size = None

    async def post(self):
        return self._post

    def get(self, key: str, default=None):
        return self._user if key == "hass_user" else default


class AiScanRegistryTest(unittest.TestCase):
    def test_only_entities_that_read_photos_are_offered(self) -> None:
        hass = FakeHass(
            entities=[
                vision_entity("ai_task.gemini"),
                FakeEntity("ai_task.text", AITaskEntityFeature.GENERATE_DATA),
                FakeEntity("ai_task.none", 0),
                FakeEntity(
                    "ai_task.image", AITaskEntityFeature.GENERATE_IMAGE
                ),
            ]
        )
        self.assertEqual(ai_scan.ai_task_entity_ids(hass), ["ai_task.gemini"])

    def test_missing_ai_task_component_is_not_an_error(self) -> None:
        hass = FakeHass(entities=[vision_entity()])
        hass.data.pop(DATA_COMPONENT)
        self.assertEqual(ai_scan.ai_task_entity_ids(hass), [])

    def test_plain_int_features_do_not_crash(self) -> None:
        hass = FakeHass(entities=[FakeEntity("ai_task.plain", 0)])
        self.assertEqual(ai_scan.ai_task_entity_ids(hass), [])


class _CapturingAiTask:
    """Replaces async_generate_data with the real keyword-only signature."""

    def __init__(self, answer=json.dumps(RECIPE), error: Exception | None = None):
        self.answer = answer
        self.error = error
        self.calls: list[dict] = []

    async def __call__(
        self,
        hass,
        *,
        task_name,
        entity_id=None,
        instructions,
        structure=None,
        attachments=None,
        context=None,
    ):
        self.calls.append(
            {
                "hass": hass,
                "task_name": task_name,
                "entity_id": entity_id,
                "instructions": instructions,
                "structure": structure,
                "attachments": attachments,
                "context": context,
            }
        )
        if self.error is not None:
            raise self.error
        return SimpleNamespace(data=self.answer)


class AiScanCallTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original = AI_TASK.async_generate_data
        self.addCleanup(setattr, AI_TASK, "async_generate_data", self.original)

    def install(self, fake: _CapturingAiTask) -> None:
        AI_TASK.async_generate_data = fake

    def test_photos_are_attached_deleted_and_parsed(self) -> None:
        fake = _CapturingAiTask()
        self.install(fake)
        with TemporaryDirectory() as folder:
            hass = FakeHass(
                media_dirs={"local": folder}, entities=[vision_entity()]
            )
            contents: list[tuple[str, bytes]] = []

            original_call = fake.__call__

            async def spy(*args, **kwargs):
                # Read the files while the AI call runs; afterwards they are gone.
                contents.extend(
                    (item.name, item.read_bytes())
                    for item in Path(folder).iterdir()
                )
                return await original_call(*args, **kwargs)

            AI_TASK.async_generate_data = spy
            recipe = asyncio_run(
                ai_scan.async_scan_recipe(
                    hass, [("image/jpeg", b"seite-1"), ("image/jpeg", b"seite-2")]
                )
            )

            self.assertEqual(recipe["title"], "Apfelkuchen")
            self.assertEqual(len(fake.calls), 1)
            call = fake.calls[0]
            self.assertEqual(call["task_name"], ai_scan.SCAN_TASK_NAME)
            self.assertIs(call["hass"], hass)
            self.assertIn("Rezeptkarte", call["instructions"])
            self.assertEqual(len(call["attachments"]), 2)
            for attachment in call["attachments"]:
                self.assertTrue(
                    attachment["media_content_id"].startswith(
                        "media-source://media_source/local/recipe_box_scan_"
                    )
                )
                self.assertEqual(attachment["media_content_type"], "image/jpeg")
            self.assertEqual(len(contents), 2, "both photos exist while the AI reads")
            for name, content in contents:
                self.assertIn("recipe_box_scan_", name)
                self.assertEqual(content[:6], b"seite-")
            self.assertEqual(list(Path(folder).iterdir()), [], "photos are deleted")

    def test_custom_media_source_id_is_used(self) -> None:
        fake = _CapturingAiTask()
        self.install(fake)
        with TemporaryDirectory() as folder:
            hass = FakeHass(media_dirs={"meine": folder}, entities=[vision_entity()])
            asyncio_run(ai_scan.async_scan_recipe(hass, [("image/png", b"png")]))
            uri = fake.calls[0]["attachments"][0]["media_content_id"]
            self.assertTrue(uri.startswith("media-source://media_source/meine/"))
            self.assertTrue(uri.endswith(".png"))

    def test_missing_media_folder_is_reported(self) -> None:
        fake = _CapturingAiTask()
        self.install(fake)
        hass = FakeHass(entities=[vision_entity()])
        with self.assertRaises(AiScanError):
            asyncio_run(ai_scan.async_scan_recipe(hass, [("image/jpeg", b"x")]))
        self.assertEqual(fake.calls, [])

    def test_provider_failure_is_wrapped_and_cleans_up(self) -> None:
        fake = _CapturingAiTask(error=HOME_ASSISTANT_ERROR("kein Bild verstanden"))
        self.install(fake)
        with TemporaryDirectory() as folder:
            hass = FakeHass(media_dirs={"local": folder}, entities=[vision_entity()])
            with self.assertRaises(AiScanError) as caught:
                asyncio_run(
                    ai_scan.async_scan_recipe(hass, [("image/jpeg", b"seite")])
                )
            self.assertIn("kein Bild verstanden", str(caught.exception))
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_unreadable_answer_is_reported(self) -> None:
        fake = _CapturingAiTask(answer="Ich sehe leider nichts.")
        self.install(fake)
        with TemporaryDirectory() as folder:
            hass = FakeHass(media_dirs={"local": folder}, entities=[vision_entity()])
            with self.assertRaises(AiScanError):
                asyncio_run(
                    ai_scan.async_scan_recipe(hass, [("image/jpeg", b"seite")])
                )


class AiScanViewTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original = AI_TASK.async_generate_data
        self.addCleanup(setattr, AI_TASK, "async_generate_data", self.original)
        self.view = AiScanView()

    def post(self, hass, files, extra=None):
        request = FakeRequest(hass, files, extra)
        return asyncio_run(self.view.post(request))

    def test_get_lists_the_usable_entities(self) -> None:
        hass = FakeHass(entities=[vision_entity(), FakeEntity("ai_task.text", 1)])
        response = asyncio_run(self.view.get(FakeRequest(hass)))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.payload, {"entities": ["ai_task.gemini"]})

    def test_post_uses_the_preferred_entity(self) -> None:
        fake = _CapturingAiTask()
        AI_TASK.async_generate_data = fake
        with TemporaryDirectory() as folder:
            hass = FakeHass(
                media_dirs={"local": folder},
                entities=[vision_entity(), vision_entity("ai_task.openai")],
            )
            hass.data[DATA_PREFERENCES] = SimpleNamespace(
                gen_data_entity_id="ai_task.openai"
            )
            response = self.post(hass, [FakeField(b"seite")])

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.payload["title"], "Apfelkuchen")
            self.assertEqual(fake.calls[0]["entity_id"], "ai_task.openai")

    def test_post_falls_back_to_a_usable_entity(self) -> None:
        fake = _CapturingAiTask()
        AI_TASK.async_generate_data = fake
        with TemporaryDirectory() as folder:
            hass = FakeHass(
                media_dirs={"local": folder}, entities=[vision_entity()]
            )
            hass.data[DATA_PREFERENCES] = SimpleNamespace(
                gen_data_entity_id="ai_task.text_only"
            )
            response = self.post(hass, [FakeField(b"seite")])
            self.assertEqual(response.status_code, 200)
            self.assertEqual(fake.calls[0]["entity_id"], "ai_task.gemini")

    def test_post_rejects_an_entity_without_photo_support(self) -> None:
        fake = _CapturingAiTask()
        AI_TASK.async_generate_data = fake
        with TemporaryDirectory() as folder:
            hass = FakeHass(
                media_dirs={"local": folder}, entities=[vision_entity()]
            )
            response = self.post(
                hass,
                [FakeField(b"seite")],
                {"entity_id": "ai_task.text_only"},
            )
            self.assertEqual(response.status_code, 400)
            self.assertEqual(fake.calls, [])

    def test_post_without_any_ai_entity_is_refused(self) -> None:
        fake = _CapturingAiTask()
        AI_TASK.async_generate_data = fake
        hass = FakeHass()
        response = self.post(hass, [FakeField(b"seite")])
        self.assertEqual(response.status_code, 400)
        self.assertIn("keine KI", response.payload["message"])
        self.assertEqual(fake.calls, [])

    def test_post_rejects_files_that_are_not_images(self) -> None:
        fake = _CapturingAiTask()
        AI_TASK.async_generate_data = fake
        with TemporaryDirectory() as folder:
            hass = FakeHass(
                media_dirs={"local": folder}, entities=[vision_entity()]
            )
            response = self.post(hass, [FakeField(b"text", "text/plain")])
            self.assertEqual(response.status_code, 400)
            self.assertEqual(fake.calls, [])

    def test_post_needs_a_photo(self) -> None:
        fake = _CapturingAiTask()
        AI_TASK.async_generate_data = fake
        hass = FakeHass(entities=[vision_entity()])
        response = self.post(hass, [])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(fake.calls, [])

    def test_too_many_pages_are_refused(self) -> None:
        fake = _CapturingAiTask()
        AI_TASK.async_generate_data = fake
        with TemporaryDirectory() as folder:
            hass = FakeHass(
                media_dirs={"local": folder}, entities=[vision_entity()]
            )
            files = [
                FakeField(b"seite") for _ in range(ai_scan.MAX_PAGES + 1)
            ]
            response = self.post(hass, files)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(fake.calls, [])

    def test_a_provider_error_becomes_a_readable_message(self) -> None:
        AI_TASK.async_generate_data = _CapturingAiTask(
            error=HOME_ASSISTANT_ERROR("Modell nicht erreichbar")
        )
        with TemporaryDirectory() as folder:
            hass = FakeHass(
                media_dirs={"local": folder}, entities=[vision_entity()]
            )
            response = self.post(hass, [FakeField(b"seite")])
            self.assertEqual(response.status_code, 502)
            self.assertIn("Modell nicht erreichbar", response.payload["message"])

    def test_the_view_is_registered_once(self) -> None:
        hass = FakeHass(entities=[vision_entity()])
        ai_scan.async_register_ai_scan(hass)
        ai_scan.async_register_ai_scan(hass)
        self.assertEqual(len(hass.http.views), 1)
        self.assertIsInstance(hass.http.views[0], AiScanView)
        self.assertTrue(hass.http.views[0].requires_auth)


def asyncio_run(coro):
    """Run a coroutine without depending on asyncio's policy in the test."""
    import asyncio

    return asyncio.run(coro)


if __name__ == "__main__":
    unittest.main()
