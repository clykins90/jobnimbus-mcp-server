# JobNimbus MCP Server

This project provides a [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol/typescript-sdk) server for interacting with the JobNimbus API. It allows AI assistants to access and manipulate JobNimbus data through standardized tools.

## Features

* **Complete JobNimbus API Integration**: Access to Contacts, Jobs, Tasks, Products, Workflows, and Invoices
* **Secure Access**: Requires JobNimbus API key for authentication
* **Easy Setup**: Simple configuration for use with Cursor editor, Claude, and other AI assistants
* **Cross-Platform**: Works with any MCP-compatible client

## Quick Start

1. **With NPX** (easiest):
   ```bash
   export JOBNIMBUS_API_KEY=your_api_key_here
   npx jobnimbus-mcp-server
   ```

2. **With Claude Desktop**: Edit `~/Library/Application Support/Claude/claude_desktop_config.json` to point to the server

3. **With Cursor**: Create `.mcp.json` in your project with the server configuration

4. **Local Installation**: Clone, build and run:
   ```bash
   git clone https://github.com/yourusername/jobnimbus-mcp-server.git
   cd jobnimbus-mcp-server
   npm install
   npm run build
   npm start
   ```

## Installation Options

### Option 1: Install via NPX (Easiest)

You can install and run the server directly with NPX:

```bash
# Set your JobNimbus API key as an environment variable
export JOBNIMBUS_API_KEY=your_api_key_here

# Run the server directly with NPX
npx jobnimbus-mcp-server
```

### Option 2: Clone the Repository

1. **Clone this repository:**
   ```bash
   git clone https://github.com/yourusername/jobnimbus-mcp-server.git
   cd jobnimbus-mcp-server
   ```

2. **Prerequisites:** Node.js (v18 or later) and npm.

3. **Install Dependencies:**
   ```bash
   npm install
   ```

4. **API Key:** Create a `.env` file in the root of the project with your JobNimbus API key:
   ```
   JOBNIMBUS_API_KEY=your_api_key_here
   ```
   *Replace `your_api_key_here` with your actual key.* **Do not commit the `.env` file to version control.**

5. **Build and Run:**
   ```bash
   npm run build
   npm start
   ```

## Running the Server

1. **Build the TypeScript code:**
   ```bash
   npm run build
   ```

2. **Start the server:**
   ```bash
   npm start
   ```
   The server will connect via stdio and listen for MCP requests.

3. **Development Mode** (watches for changes and rebuilds/restarts):
   ```bash
   npm run dev
   ```

## Using with Cursor Editor

To use this MCP server with the Cursor editor:

1. Create a `.mcp.json` file in your Cursor project root directory:
   ```json
   {
     "mcpServers": {
       "jobnimbus-local-server": {
         "command": "npx",
         "args": ["jobnimbus-mcp-server"],
         "env": {
           "JOBNIMBUS_API_KEY": "your_api_key_here"
         }
       }
     }
   }
   ```

   Or if using a local installation:
   ```json
   {
     "mcpServers": {
       "jobnimbus-local-server": {
         "command": "npm",
         "args": ["start"],
         "cwd": "/absolute/path/to/jobnimbus-mcp-server",
         "env": {
           "JOBNIMBUS_API_KEY": "your_api_key_here"
         }
       }
     }
   }
   ```

2. Restart Cursor to load the MCP configuration.

## Using with Claude

The server can be used with Anthropic's Claude AI assistant which supports the Model Context Protocol:

1. Install Claude desktop app if you haven't already

2. Build your JobNimbus MCP server:
   ```bash
   npm run build
   ```

3. Create or edit Claude's configuration file:
   - On Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - On Windows: `%APPDATA%\Claude\claude_desktop_config.json`

4. Add the following configuration (adjust paths to your installation):
   ```json
   {
     "mcpServers": {
       "jobnimbus-local-server": {
         "command": "/path/to/your/node",
         "args": [
           "/absolute/path/to/jobnimbus-mcp-server/dist/server.js"
         ],
         "env": {
           "JOBNIMBUS_API_KEY": "your_api_key_here"
         }
       }
     }
   }
   ```

   For example, with Node.js installed via NVM on Mac:
   ```json
   {
     "mcpServers": {
       "jobnimbus-local-server": {
         "command": "/Users/username/.nvm/versions/node/v16.20.0/bin/node",
         "args": [
           "/Users/username/projects/jobnimbus-mcp-server/dist/server.js"
         ],
         "env": {
           "JOBNIMBUS_API_KEY": "your_api_key_here"
         }
       }
     }
   }
   ```

5. Restart Claude desktop app

6. When you're in a conversation with Claude, you can now use JobNimbus tools with commands like:
   - "Please list all contacts in my JobNimbus account"
   - "Create a new job for customer John Smith"
   - "Show me all invoices that are past due"
   - "Update the status of job J-12345 to 'In Progress'"

## Using with Other AI Assistants

For other AI assistants that support the Model Context Protocol, use a similar configuration as shown above for Cursor.

## Implemented Tools

This server implements MCP tools corresponding to the JobNimbus API endpoints:

### Contacts
* `jobnimbus_list_contacts`: Get a list of contacts with optional filtering
* `jobnimbus_get_contact`: Get a specific contact by ID
* `jobnimbus_create_contact`: Create a new contact
* `jobnimbus_update_contact`: Update an existing contact

### Jobs
* `jobnimbus_list_jobs`: Get a list of jobs with optional filtering
* `jobnimbus_get_job`: Get a specific job by ID
* `jobnimbus_create_job`: Create a new job
* `jobnimbus_update_job`: Update an existing job

### Tasks
* `jobnimbus_list_tasks`: Get a list of tasks with optional filtering
* `jobnimbus_get_task`: Get a specific task by ID
* `jobnimbus_create_task`: Create a new task
* `jobnimbus_update_task`: Update an existing task

### Products
* `jobnimbus_list_products`: Get a list of products with optional filtering
* `jobnimbus_get_product`: Get a specific product by ID
* `jobnimbus_create_product`: Create a new product
* `jobnimbus_update_product`: Update an existing product

### Workflows
* `jobnimbus_get_all_workflows`: Get all workflows and their statuses
* `jobnimbus_create_workflow`: Create a new workflow
* `jobnimbus_create_workflow_status`: Create a new workflow status

### Invoices
* `jobnimbus_list_invoices`: Get a list of invoices with optional filtering
* `jobnimbus_get_invoice`: Get a specific invoice by ID
* `jobnimbus_create_invoice`: Create a new invoice
* `jobnimbus_update_invoice`: Update an existing invoice
* `jobnimbus_send_invoice`: Send an invoice via email
* `jobnimbus_record_invoice_payment`: Record a payment against an invoice

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 