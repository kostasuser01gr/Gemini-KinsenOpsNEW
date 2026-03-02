# Connector Setup (ChatGPT Developer Mode)

## MCP Connection
To add this project as a remote MCP server in ChatGPT:

1. Go to **Settings** > **Developer Mode**.
2. Click **Add New Connector**.
3. Use the following details:
   - **Name**: Ops Assistant
   - **Endpoint URL**: `https://<YOUR_WORKER_URL>/mcp`
   - **Method**: Streamable HTTP
   - **Headers**:
     - `Authorization`: `Bearer <YOUR_MCP_API_KEY>`
4. Test the connection.

## Write Permissions & Confirmation
- Any WRITE tool (e.g., `retention.run_now`) will first respond with a `plan` and `token_required: true`.
- To confirm, call the tool again with `dry_run: false` and the matching `confirm_token`.
- `CONFIRM_TOKEN` is set as a secret on the worker.

## Troubleshooting
- **403 Origin Denied**: Ensure you're connecting from an approved origin.
- **401 Auth Required**: Verify the `MCP_API_KEY` header.
- **Rate Limit**: If multiple requests fail, wait 1 minute.
