import asyncio
import sys
import json
import base64
from copilot import CopilotClient, PermissionHandler

async def main():
    # Force UTF-8 output, crucial for Windows where default console encoding is often cp932 (Shift-JIS)
    sys.stdout.reconfigure(encoding='utf-8')

    if len(sys.argv) < 2:
        print("Error: No input provided as argument", file=sys.stderr)
        sys.exit(1)

    try:
        # Read the base64 encoded JSON string from the first argument
        base64_input = sys.argv[1]
        json_input = base64.b64decode(base64_input).decode('utf-8')
        data = json.loads(json_input)
        
        prompt = data.get("prompt")
        model = data.get("model", "gpt-4o")
        vault_path = data.get("vaultPath", "")
    except Exception as e:
        print(f"Error parsing input: {e}", file=sys.stderr)
        sys.exit(1)

    if not prompt:
        print("Error: 'prompt' missing in input JSON", file=sys.stderr)
        sys.exit(1)

    client = CopilotClient()
    await client.start()

    try:
        session_args = {
            "model": model,
            "streaming": False,
            "on_permission_request": PermissionHandler.approve_all
        }
        
        if vault_path:
            # Tell the Copilot SDK where the project root (Vault) is
            session_args["workspace_folder"] = vault_path
            
        session = await client.create_session(session_args)

        # Send the prompt and wait for the full response
        # Since we disabled streaming, we can just print the final result
        response = await session.send_and_wait({"prompt": prompt})
        
        if response and response.data and response.data.content:
             print(response.data.content)
        else:
             print("Error: Empty response from Copilot", file=sys.stderr)

    except Exception as e:
        print(f"❌ Error occurred: {e}", file=sys.stderr)
    finally:
        await client.stop()

if __name__ == "__main__":
    asyncio.run(main())
