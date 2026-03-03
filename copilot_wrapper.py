import asyncio
import sys
import json
from copilot import CopilotClient, PermissionHandler

async def main():
    # Read prompt from stdin
    input_data = sys.stdin.read()
    if not input_data:
        print("Error: No input provided on stdin", file=sys.stderr)
        sys.exit(1)

    try:
        data = json.loads(input_data)
        prompt = data.get("prompt")
        model = data.get("model", "gpt-4o")
        # In a real app we might use session_id to maintain context, 
        # but the copilot-sdk currently handles single-shot send_and_wait nicely.
    except json.JSONDecodeError:
        print("Error: Invalid JSON input", file=sys.stderr)
        sys.exit(1)

    if not prompt:
        print("Error: 'prompt' missing in input JSON", file=sys.stderr)
        sys.exit(1)

    client = CopilotClient()
    await client.start()

    try:
        session = await client.create_session({
            "model": model,
            "streaming": True,
            "on_permission_request": PermissionHandler.approve_all
        })

        def on_event(event):
            if event.type.value == "assistant.message_delta":
                delta = event.data.delta_content or ""
                print(delta, end="", flush=True)

        session.on(on_event)

        # Send the prompt to Copilot
        await session.send_and_wait({"prompt": prompt})

    except Exception as e:
        print(f"❌ Error occurred: {e}", file=sys.stderr)
    finally:
        await client.stop()

if __name__ == "__main__":
    asyncio.run(main())
