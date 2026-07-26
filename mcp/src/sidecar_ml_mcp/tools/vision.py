"""Vision tools — the eleven `/v1/vision/*` routes."""

from __future__ import annotations

import base64

from fastmcp import FastMCP
from fastmcp.utilities.types import Image

from ..media import decode_envelope, image_format, resolve_media, save_bytes
from ..state import get_connection

ROUTES = {
    "ocr_image": "POST /v1/vision/ocr",
    "read_barcodes": "POST /v1/vision/barcodes",
    "classify_image": "POST /v1/vision/classify",
    "image_embedding": "POST /v1/vision/feature-print",
    "compare_images": "POST /v1/vision/similarity",
    "remove_background": "POST /v1/vision/subject-mask",
    "segment_person": "POST /v1/vision/person-segmentation",
    "detect_faces": "POST /v1/vision/faces",
    "detect_body_pose": "POST /v1/vision/body-pose",
    "detect_hand_pose": "POST /v1/vision/hand-pose",
    "scan_document": "POST /v1/vision/document",
}


def register(mcp: FastMCP) -> None:
    @mcp.tool(tags={"vision"}, annotations={"readOnlyHint": True})
    async def ocr_image(
        image: str,
        languages: str | None = None,
        level: str = "accurate",
        correction: bool = True,
        include_lines: bool = False,
    ) -> dict:
        """Read printed or handwritten text out of an image (on-device OCR).

        Args:
            image: A local file path, an http(s) URL, or base64-encoded image data.
            languages: Comma-separated BCP-47 hints, e.g. "en-US,de-DE".
            level: "accurate" (default) or "fast".
            correction: Apply language correction to the recognised text.
            include_lines: Also return per-line bounding boxes and confidence.
                Off by default because it is far more verbose than the text.
        """
        phone = get_connection()
        await phone.require(ROUTES["ocr_image"])
        data, content_type = await resolve_media(image, "image")
        result = await phone.post_raw(
            "/v1/vision/ocr",
            data,
            content_type,
            {"languages": languages, "level": level, "correction": correction},
        )
        lines = result.get("lines", [])
        summary = {
            "text": result.get("text", ""),
            "line_count": len(lines),
            "image": result.get("image"),
        }
        if include_lines:
            summary["lines"] = lines
        return summary

    @mcp.tool(tags={"vision"}, annotations={"readOnlyHint": True})
    async def read_barcodes(image: str, symbologies: str | None = None) -> dict:
        """Detect and decode barcodes and QR codes in an image.

        Args:
            image: A local file path, an http(s) URL, or base64-encoded image data.
            symbologies: Comma-separated filter, e.g. "qr,ean13,code128". Also
                supports aztec, code39, code93, ean8, pdf417, datamatrix, upce,
                itf14, codabar, microqr. Unknown names are ignored.
        """
        phone = get_connection()
        await phone.require(ROUTES["read_barcodes"])
        data, content_type = await resolve_media(image, "image")
        return await phone.post_raw(
            "/v1/vision/barcodes", data, content_type, {"symbologies": symbologies}
        )

    @mcp.tool(tags={"vision"}, annotations={"readOnlyHint": True})
    async def classify_image(
        image: str, top_k: int = 10, min_confidence: float = 0.05
    ) -> dict:
        """Label the contents of an image against ~1000 general classes.

        Args:
            image: A local file path, an http(s) URL, or base64-encoded image data.
            top_k: Maximum labels to return, highest confidence first.
            min_confidence: Drop labels below this confidence (0-1).
        """
        phone = get_connection()
        await phone.require(ROUTES["classify_image"])
        data, content_type = await resolve_media(image, "image")
        return await phone.post_raw(
            "/v1/vision/classify",
            data,
            content_type,
            {"top_k": top_k, "min_confidence": min_confidence},
        )

    @mcp.tool(tags={"vision"}, annotations={"readOnlyHint": True})
    async def image_embedding(image: str, save_path: str | None = None) -> dict:
        """Compute an image embedding vector for similarity search or clustering.

        Returns the dimension and a short preview, not the whole vector — the raw
        floats are not useful as text. Pass save_path to write the full vector to
        disk as JSON.

        Args:
            image: A local file path, an http(s) URL, or base64-encoded image data.
            save_path: Optional path to write the complete vector as JSON.
        """
        import json

        phone = get_connection()
        await phone.require(ROUTES["image_embedding"])
        data, content_type = await resolve_media(image, "image")
        result = await phone.post_raw("/v1/vision/feature-print", data, content_type)
        embedding = result.get("embedding", [])
        summary = {
            "element_count": result.get("element_count", len(embedding)),
            "preview": [round(v, 4) for v in embedding[:8]],
            "note": "Full vector omitted; pass save_path to write it to disk.",
        }
        if save_path:
            summary["saved_to"] = save_bytes(
                json.dumps(result).encode(), save_path
            )
            summary.pop("note")
        return summary

    @mcp.tool(tags={"vision"}, annotations={"readOnlyHint": True})
    async def compare_images(image_a: str, image_b: str) -> dict:
        """Measure visual similarity between two images.

        Returns a distance (lower is more similar) plus a human-readable hint:
        near duplicate < 0.35, very similar < 0.65, related < 0.95, else different.

        Args:
            image_a: A local file path, an http(s) URL, or base64-encoded image data.
            image_b: The image to compare against, same accepted forms.
        """
        phone = get_connection()
        await phone.require(ROUTES["compare_images"])
        data_a, _ = await resolve_media(image_a, "image")
        data_b, _ = await resolve_media(image_b, "image")
        return await phone.post_json(
            "/v1/vision/similarity",
            {
                "image_a_base64": base64.b64encode(data_a).decode(),
                "image_b_base64": base64.b64encode(data_b).decode(),
            },
        )

    @mcp.tool(tags={"vision"}, output_schema=None)
    async def remove_background(
        image: str,
        mode: str = "cutout",
        crop: bool = False,
        save_path: str | None = None,
    ) -> list:
        """Isolate the main subject of a photo, removing its background.

        Args:
            image: A local file path, an http(s) URL, or base64-encoded image data.
            mode: "cutout" for a transparent-background PNG of the subject, or
                "mask" for a black-and-white subject mask.
            crop: Crop the cutout to the subject's bounds (cutout mode only).
            save_path: Optional path to also write the resulting PNG to disk.
        """
        phone = get_connection()
        await phone.require(ROUTES["remove_background"])
        data, content_type = await resolve_media(image, "image")
        result = await phone.post_raw(
            "/v1/vision/subject-mask", data, content_type, {"mode": mode, "crop": crop}
        )
        return _binary_result(result, save_path, {"mode": mode})

    @mcp.tool(tags={"vision"}, output_schema=None)
    async def segment_person(
        image: str, quality: str = "balanced", save_path: str | None = None
    ) -> list:
        """Produce a person-segmentation mask (white where people are).

        Args:
            image: A local file path, an http(s) URL, or base64-encoded image data.
            quality: "fast", "balanced" (default) or "accurate".
            save_path: Optional path to also write the mask PNG to disk.
        """
        phone = get_connection()
        await phone.require(ROUTES["segment_person"])
        data, content_type = await resolve_media(image, "image")
        result = await phone.post_raw(
            "/v1/vision/person-segmentation", data, content_type, {"quality": quality}
        )
        return _binary_result(result, save_path, {"quality": quality})

    @mcp.tool(tags={"vision"}, annotations={"readOnlyHint": True})
    async def detect_faces(image: str, include_landmarks: bool = False) -> dict:
        """Find faces in an image with bounding boxes and head orientation.

        Args:
            image: A local file path, an http(s) URL, or base64-encoded image data.
            include_landmarks: Also return the 12 facial landmark regions (eyes,
                lips, contour, …). Very verbose — off by default.
        """
        phone = get_connection()
        await phone.require(ROUTES["detect_faces"])
        data, content_type = await resolve_media(image, "image")
        result = await phone.post_raw("/v1/vision/faces", data, content_type)
        faces = []
        for face in result.get("faces", []):
            trimmed = {k: v for k, v in face.items() if k != "landmarks"}
            if include_landmarks and "landmarks" in face:
                trimmed["landmarks"] = face["landmarks"]
            faces.append(trimmed)
        return {"face_count": len(faces), "faces": faces, "image": result.get("image")}

    @mcp.tool(tags={"vision"}, annotations={"readOnlyHint": True})
    async def detect_body_pose(image: str, min_confidence: float = 0.1) -> dict:
        """Detect human body skeletons — up to 19 joints per person.

        Args:
            image: A local file path, an http(s) URL, or base64-encoded image data.
            min_confidence: Drop joints the model is less sure about than this.
        """
        phone = get_connection()
        await phone.require(ROUTES["detect_body_pose"])
        data, content_type = await resolve_media(image, "image")
        result = await phone.post_raw("/v1/vision/body-pose", data, content_type)
        persons = [
            {"joints": _filter_joints(person.get("joints", {}), min_confidence)}
            for person in result.get("persons", [])
        ]
        return {
            "person_count": len(persons),
            "persons": persons,
            "image": result.get("image"),
        }

    @mcp.tool(tags={"vision"}, annotations={"readOnlyHint": True})
    async def detect_hand_pose(
        image: str, max_hands: int = 2, min_confidence: float = 0.1
    ) -> dict:
        """Detect hands with up to 21 joints each, and left/right chirality.

        Args:
            image: A local file path, an http(s) URL, or base64-encoded image data.
            max_hands: Maximum hands to detect.
            min_confidence: Drop joints the model is less sure about than this.
        """
        phone = get_connection()
        await phone.require(ROUTES["detect_hand_pose"])
        data, content_type = await resolve_media(image, "image")
        result = await phone.post_raw(
            "/v1/vision/hand-pose", data, content_type, {"max_hands": max_hands}
        )
        hands = [
            {
                **{k: v for k, v in hand.items() if k != "joints"},
                "joints": _filter_joints(hand.get("joints", {}), min_confidence),
            }
            for hand in result.get("hands", [])
        ]
        return {"hand_count": len(hands), "hands": hands, "image": result.get("image")}

    @mcp.tool(tags={"vision"}, output_schema=None)
    async def scan_document(
        image: str,
        correct: bool = True,
        format: str = "png",
        save_path: str | None = None,
    ) -> list:
        """Detect a document in a photo and return a perspective-corrected scan.

        Args:
            image: A local file path, an http(s) URL, or base64-encoded image data.
            correct: Return the perspective-corrected scan, not just the corners.
            format: "png" or "jpeg" — JPEG is typically 5-10x smaller.
            save_path: Optional path to also write the corrected scan to disk.
        """
        phone = get_connection()
        await phone.require(ROUTES["scan_document"])
        data, content_type = await resolve_media(image, "image")
        result = await phone.post_raw(
            "/v1/vision/document",
            data,
            content_type,
            {"correct": correct, "format": format},
        )
        meta = {
            "detected": result.get("detected", False),
            "confidence": result.get("confidence"),
            "quad_px": result.get("quad_px"),
            "image": result.get("image"),
        }
        envelope = result.get("corrected")
        if not envelope:
            return [{k: v for k, v in meta.items() if v is not None}]
        return _binary_result(envelope, save_path, meta)


def _filter_joints(joints: dict, min_confidence: float) -> dict:
    return {
        name: joint
        for name, joint in joints.items()
        if not isinstance(joint, dict) or joint.get("confidence", 1.0) >= min_confidence
    }


def _binary_result(envelope: dict, save_path: str | None, meta: dict) -> list:
    """Image content block plus a compact metadata block."""
    data, content_type = decode_envelope(envelope)
    summary = {k: v for k, v in meta.items() if v is not None}
    summary["bytes"] = len(data)
    summary["content_type"] = content_type
    for key in ("width", "height"):
        if key in envelope:
            summary[key] = envelope[key]
    if save_path:
        summary["saved_to"] = save_bytes(data, save_path)
    return [Image(data=data, format=image_format(content_type)), summary]
