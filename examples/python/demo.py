#!/usr/bin/env python3
"""Quick CLI against a ML Sidecar iPhone.

    python demo.py --base-url http://192.168.1.20:8080 health
    python demo.py capabilities
    python demo.py ocr receipt.jpg
    python demo.py chat "Summarize why on-device ML is useful."
    python demo.py chat-stream "Write a haiku about telephones."
    python demo.py speak "Hello from Python" --out hello.wav
    python demo.py transcribe hello.wav
    python demo.py classify photo.jpg
    python demo.py remove-bg photo.jpg --out cutout.png
    python demo.py translate "Good morning" --target de
"""

from __future__ import annotations

import argparse
import json
import sys

from client import SidecarClient, SidecarError


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--token", default=None, help="Bearer token if auth is enabled")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("health")
    sub.add_parser("capabilities")
    for name in ("ocr", "classify", "barcodes", "faces"):
        command = sub.add_parser(name)
        command.add_argument("image")
    remove_bg = sub.add_parser("remove-bg")
    remove_bg.add_argument("image")
    remove_bg.add_argument("--out", default="cutout.png")
    chat = sub.add_parser("chat")
    chat.add_argument("prompt")
    chat_stream = sub.add_parser("chat-stream")
    chat_stream.add_argument("prompt")
    speak = sub.add_parser("speak")
    speak.add_argument("text")
    speak.add_argument("--out", default="speech.wav")
    transcribe = sub.add_parser("transcribe")
    transcribe.add_argument("audio")
    transcribe.add_argument("--locale", default="en-US")
    sound = sub.add_parser("sound")
    sound.add_argument("audio")
    translate = sub.add_parser("translate")
    translate.add_argument("text")
    translate.add_argument("--target", required=True)
    translate.add_argument("--source", default=None)

    args = parser.parse_args()
    dump = lambda value: print(json.dumps(value, indent=2, ensure_ascii=False))  # noqa: E731

    try:
        with SidecarClient(args.base_url, token=args.token) as phone:
            if args.command == "health":
                dump(phone.health())
            elif args.command == "capabilities":
                for capability in phone.capabilities():
                    marker = "✓" if capability["available"] else "✗"
                    print(f"{marker} {capability['id']:20s} {capability['name']}")
                    if not capability["available"]:
                        print(f"    ↳ {capability.get('reason', '')}")
            elif args.command == "ocr":
                result = phone.ocr(args.image)
                print(result["text"])
            elif args.command == "classify":
                for item in phone.classify(args.image)["classifications"]:
                    print(f"{item['confidence']:6.1%}  {item['label']}")
            elif args.command == "barcodes":
                dump(phone.barcodes(args.image))
            elif args.command == "faces":
                dump(phone.faces(args.image))
            elif args.command == "remove-bg":
                path = phone.remove_background(args.image, args.out)
                print(f"saved {path}")
            elif args.command == "chat":
                print(phone.chat(args.prompt))
            elif args.command == "chat-stream":
                for delta in phone.chat_stream(args.prompt):
                    print(delta, end="", flush=True)
                print()
            elif args.command == "speak":
                path = phone.speak(args.text, args.out)
                print(f"saved {path}")
            elif args.command == "transcribe":
                result = phone.transcribe(args.audio, locale=args.locale)
                print(result["text"])
            elif args.command == "sound":
                for item in phone.classify_sound(args.audio)["top"]:
                    print(f"{item['confidence']:6.1%}  {item['label']}")
            elif args.command == "translate":
                print(phone.translate(args.text, target=args.target, source=args.source))
    except SidecarError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    except Exception as error:  # noqa: BLE001
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
