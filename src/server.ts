#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios, { AxiosError } from "axios";
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

console.error("MCP Server Script Started.");

// --- Configuration ---
const jobnimbusApiBase = "https://app.jobnimbus.com/api1";
// IMPORTANT: Store API key securely, e.g., environment variable
const apiKey = process.env.JOBNIMBUS_API_KEY;
console.error(`Read API Key: ${apiKey ? 'Yes (masked)' : 'No'}`);

if (!apiKey) {
    console.error("FATAL ERROR: JOBNIMBUS_API_KEY environment variable is not set.");
    console.error("Please set this variable in your .env file or environment.");
    console.error("Example: export JOBNIMBUS_API_KEY=your_api_key_here");
    process.exit(1); // Exit if the API key is missing
}

console.error("Initializing McpServer...");
// --- MCP Server Setup ---
const server = new McpServer({
    name: "JobNimbus MCP Server",
    version: "1.0.0",
});
console.error("McpServer Initialized.");

// --- Helper Function for API Calls ---
async function callJobNimbusApi<T>(
    method: 'get' | 'post' | 'put' | 'delete',
    endpoint: string,
    params?: unknown, // For GET requests query params
    data?: unknown    // For POST/PUT request body
): Promise<T> {
    try {
        const response = await axios({
            method,
            url: `${jobnimbusApiBase}${endpoint}`,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json', // Assume JSON for POST/PUT
            },
            params: method === 'get' ? params : undefined,
            data: (method === 'post' || method === 'put') ? data : undefined,
            timeout: 15000, // 15 second timeout
        });
        return response.data;
    } catch (error: unknown) {
        const axiosError = error as AxiosError;
        console.error(`Error calling JobNimbus API (${method.toUpperCase()} ${endpoint}):`,
            axiosError.response?.status,
            axiosError.response?.data || axiosError.message
        );
        // Re-throw a more structured error or the original data if available
        throw axiosError.response?.data || new Error(`JobNimbus API request failed: ${axiosError.message}`);
    }
}

// --- Tool Implementation Helper ---
function createTool<TInputSchema extends z.ZodObject<any>, TOutput>(
    name: string,
    inputSchema: TInputSchema,
    apiMethod: 'get' | 'post' | 'put',
    endpointTemplate: string | ((input: z.infer<TInputSchema>) => string), // Can be a template string or a function to generate the endpoint
    inputTransformer?: (input: z.infer<TInputSchema>) => unknown // Optional function to transform input before sending to API
) {
    server.tool(name, inputSchema.shape, async (args, extra) => {
        const input = args;
        const endpoint = typeof endpointTemplate === 'function'
            ? endpointTemplate(input)
            : endpointTemplate;
        const params = apiMethod === 'get' ? input : undefined;
        const data = (apiMethod === 'post' || apiMethod === 'put')
            ? (inputTransformer ? inputTransformer(input) : input)
            : undefined;

        try {
            const result = await callJobNimbusApi<TOutput>(apiMethod, endpoint, params, data);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error calling ${name}: ${error.message || JSON.stringify(error)}`,
                }],
                isError: true,
            };
        }
    });
}

// --- Contacts API Tools ---

// 1. List Contacts
const ListContactsInputSchema = z.object({
    page: z.number().int().optional(),
    size: z.number().int().optional(),
    search: z.string().optional(),
    sort_by: z.string().optional(),
    sort_dir: z.enum(["ASC", "DESC"]).optional(),
    status: z.string().optional(), // Filter by status name
    contact_type: z.string().optional(), // Filter by contact type name
}).strict();
createTool("jobnimbus_list_contacts", ListContactsInputSchema, 'get', '/contacts');

// 2. Get Contact
const GetContactInputSchema = z.object({
    id: z.string(), // JNID of the contact
}).strict();
createTool("jobnimbus_get_contact", GetContactInputSchema, 'get', (input) => `/contacts/${input.id}`);

// 3. Create Contact
// Define required and optional fields based on typical usage; JN API might have specific minimums
const CreateContactInputSchema = z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    company_name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address_line_1: z.string().optional(),
    city: z.string().optional(),
    state_text: z.string().optional(),
    zip: z.string().optional(),
    // Add other relevant fields as needed, mark as optional
    status: z.string().optional(), // e.g., "Lead"
    contact_type: z.string().optional(), // e.g., "Customer"
    // Ensure at least one identifying field is present if required by API (e.g., name/company)
}).passthrough(); // Use passthrough to allow any other valid JN fields
createTool("jobnimbus_create_contact", CreateContactInputSchema, 'post', '/contacts');

// 4. Update Contact
const UpdateContactInputSchema = z.object({
    id: z.string(), // JNID of the contact to update
    // Include all fields from Create, but all are optional for update
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    company_name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address_line_1: z.string().optional(),
    city: z.string().optional(),
    state_text: z.string().optional(),
    zip: z.string().optional(),
    status: z.string().optional(),
    contact_type: z.string().optional(),
}).passthrough(); // Allow any other valid JN fields

// Need a custom transformer for Update to remove the 'id' from the body
createTool(
    "jobnimbus_update_contact",
    UpdateContactInputSchema,
    'put',
    (input) => `/contacts/${input.id}`,
    (input) => {
        const { id, ...updateData } = input; // Exclude 'id' from the data payload
        return updateData;
    }
);

// --- Jobs API Tools ---

// 1. List Jobs
const ListJobsInputSchema = z.object({
    page: z.number().int().optional(),
    size: z.number().int().optional(),
    search: z.string().optional(),
    sort_by: z.string().optional(),
    sort_dir: z.enum(["ASC", "DESC"]).optional(),
    primary_id: z.string().optional(), // Filter by primary contact/lead JNID
    status: z.string().optional(), // Filter by status name
    job_type: z.string().optional(), // Filter by job type
}).strict();
createTool("jobnimbus_list_jobs", ListJobsInputSchema, 'get', '/jobs');

// 2. Get Job
const GetJobInputSchema = z.object({
    id: z.string(), // JNID of the job
}).strict();
createTool("jobnimbus_get_job", GetJobInputSchema, 'get', (input) => `/jobs/${input.id}`);

// 3. Create Job
// Updated to match the actual API schema based on real-world examples
const CreateJobInputSchema = z.object({
    name: z.string().optional(),
    number: z.string().optional(),
    description: z.string().optional(),
    // Updated field names to match API
    record_type_name: z.string().optional(), // Instead of job_type
    status_name: z.string().optional(), // Instead of status
    // Support for nested primary contact
    primary: z.object({
        id: z.string()
    }).optional(),
    // Support for geo coordinates
    geo: z.object({
        lat: z.number(),
        lon: z.number()
    }).optional(),
    // Keep address fields
    address_line_1: z.string().optional(),
    city: z.string().optional(),
    state_text: z.string().optional(),
    zip: z.string().optional(),
    // Keep backward compatibility for direct primary_id
    primary_id: z.string().optional(), // Will be transformed to primary.id if used
}).passthrough(); // Allow any other valid JN job fields

// Update createTool with a transformer to handle primary_id to primary.id conversion
createTool(
    "jobnimbus_create_job",
    CreateJobInputSchema,
    'post',
    '/jobs',
    (input) => {
        // Create a copy of the input to modify
        const transformedInput = { ...input };
        
        // If primary_id is provided but primary is not, convert it to the nested format
        if (transformedInput.primary_id && !transformedInput.primary) {
            transformedInput.primary = { id: transformedInput.primary_id };
            // Remove the flat primary_id field
            delete transformedInput.primary_id;
        }
        
        return transformedInput;
    }
);

// 4. Update Job
const UpdateJobInputSchema = z.object({
    id: z.string(), // JNID of the job to update
    // All fields are optional for update
    name: z.string().optional(),
    number: z.string().optional(),
    description: z.string().optional(),
    // Updated field names to match API
    record_type_name: z.string().optional(), // Instead of job_type
    status_name: z.string().optional(), // Instead of status
    // Support for nested primary contact
    primary: z.object({
        id: z.string()
    }).optional(),
    // Support for geo coordinates
    geo: z.object({
        lat: z.number(),
        lon: z.number()
    }).optional(),
    address_line_1: z.string().optional(),
    city: z.string().optional(),
    state_text: z.string().optional(),
    zip: z.string().optional(),
    // Keep backward compatibility for direct primary_id
    primary_id: z.string().optional(), // Will be transformed to primary.id if used
}).passthrough(); // Allow any other valid JN job fields

createTool(
    "jobnimbus_update_job",
    UpdateJobInputSchema,
    'put',
    (input) => `/jobs/${input.id}`,
    (input) => {
        // Create a copy to avoid modifying the original input
        const { id, ...updateData } = { ...input };
        
        // If primary_id is provided but primary is not, convert it to the nested format
        if (updateData.primary_id && !updateData.primary) {
            updateData.primary = { id: updateData.primary_id };
            // Remove the flat primary_id field
            delete updateData.primary_id;
        }
        
        return updateData;
    }
);

// --- Workflows API Tools ---

// 1. Get All Workflows (from Settings)
// Input is empty, no params needed for this specific endpoint
const GetAllWorkflowsInputSchema = z.object({}).strict();

server.tool(
    "jobnimbus_get_all_workflows",
    GetAllWorkflowsInputSchema.shape,
    async () => {
        const endpoint = '/account/settings';
        try {
            // Directly call the API helper as this endpoint has a unique structure
            const settingsResult = await callJobNimbusApi<any>( // Use 'any' for now, refine if settings structure is known
                'get',
                endpoint
            );
            // Extract only the workflows array as per backend.mdc
            const workflows = settingsResult?.workflows || [];
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(workflows, null, 2),
                }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error calling jobnimbus_get_all_workflows: ${error.message || JSON.stringify(error)}`,
                }],
                isError: true,
            };
        }
    }
);

// 2. Create Workflow
// IMPORTANT: Body requires fields directly, not nested under a 'params' key (handled by createTool)
const CreateWorkflowInputSchema = z.object({
    name: z.string(), // Workflow name, required parameter
    object_type: z.string(), // Workflow object type, required parameter (valid values: contact, job, workorder)
    record_type_id: z.number().int().optional(), // Integer ID (e.g., 40=Contact, 50=Job)
    is_sub_contractor: z.boolean().optional().default(false), // Optional field
    can_access_by_all: z.boolean().optional().default(false), // Optional field
    is_vendor: z.boolean().optional().default(false), // Optional field
    is_active: z.boolean().optional().default(true), // Optional field
    is_supplier: z.boolean().optional().default(false), // Optional field
    description: z.string().optional(), // Keep the description field
}).passthrough(); // Allow additional fields the API might accept
createTool("jobnimbus_create_workflow", CreateWorkflowInputSchema, 'post', '/account/workflow');

// 3. Create Workflow Status
const CreateWorkflowStatusInputSchema = z.object({
    workflow_id: z.number().int(), // This will be part of the URL path
    name: z.string(), // Status name, required parameter
    is_lead: z.boolean().optional().default(false), // Optional field
    is_closed: z.boolean().optional().default(false), // Optional field
    is_archived: z.boolean().optional().default(false), // Optional field
    send_to_quickbooks: z.boolean().optional().default(false), // Optional field
    force_mobile_sync: z.boolean().optional().default(false), // Optional field
    is_active: z.boolean().optional().default(true), // Optional field
    color: z.string().optional(), // Keep the color field from previous implementation
    sort_order: z.number().int().optional(), // Keep the sort_order field from previous implementation
}).passthrough(); // Changed from strict() to passthrough() to allow additional fields

// Need custom handling because workflow_id is in the path, not the body
server.tool(
    "jobnimbus_create_workflow_status",
    CreateWorkflowStatusInputSchema.shape,
    async (input) => {
        const { workflow_id, ...statusData } = input;
        const endpoint = `/account/workflow/${workflow_id}/status`;
        try {
            const result = await callJobNimbusApi<any>('post', endpoint, undefined, statusData);
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error calling jobnimbus_create_workflow_status: ${error.message || JSON.stringify(error)}`,
                }],
                isError: true,
            };
        }
    }
);

// --- Tasks API Tools ---

// 1. List Tasks
const ListTasksInputSchema = z.object({
    page: z.number().int().optional(),
    size: z.number().int().optional(),
    search: z.string().optional(),
    sort_by: z.string().optional(),
    sort_dir: z.enum(["ASC", "DESC"]).optional(),
    status: z.string().optional(), // Filter by status name
    assignee: z.string().optional(), // Filter by assignee JNID
    related_contact: z.string().optional(), // Filter by related contact JNID
    related_job: z.string().optional(), // Filter by related job JNID
}).strict();
createTool("jobnimbus_list_tasks", ListTasksInputSchema, 'get', '/tasks');

// 2. Get Task
const GetTaskInputSchema = z.object({
    id: z.string(), // JNID of the task
}).strict();
createTool("jobnimbus_get_task", GetTaskInputSchema, 'get', (input) => `/tasks/${input.id}`);

// 3. Create Task
// Updated to match the actual API schema with fields from the sample curl request
const CreateTaskInputSchema = z.object({
    title: z.string(), // Main field for task title from curl example
    description: z.string().optional(),
    status: z.string().optional(),
    priority: z.string().optional(), // e.g., "High", "Medium", "Low"
    due_date: z.string().datetime({ offset: true }).optional(), // ISO 8601 format
    date_start: z.number().int().optional(), // Unix timestamp from curl example
    date_end: z.number().int().optional(), // Unix timestamp from curl example
    record_type: z.number().int().optional(), // Numeric type ID from curl example
    record_type_name: z.string().optional(), // Type name from curl example (e.g., "Appointment")
    // Related entities - support both formats
    assignees: z.array(z.string()).optional(), // Array of assignee JNIDs
    related_contacts: z.array(z.string()).optional(), // Array of related contact JNIDs
    related_jobs: z.array(z.string()).optional(), // Array of related job JNIDs
    related: z.array(z.object({
        id: z.string()
    })).optional(), // Alternative format from curl example
}).passthrough();

// Simple direct tool without transformation since field names match API
createTool("jobnimbus_create_task", CreateTaskInputSchema, 'post', '/tasks');

// 4. Update Task
const UpdateTaskInputSchema = z.object({
    id: z.string(), // JNID of the task to update
    // All fields optional for update
    title: z.string().optional(), // Main field for task title
    description: z.string().optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    due_date: z.string().datetime({ offset: true }).optional(),
    date_start: z.number().int().optional(), // Unix timestamp
    date_end: z.number().int().optional(), // Unix timestamp
    record_type: z.number().int().optional(), 
    record_type_name: z.string().optional(),
    assignees: z.array(z.string()).optional(),
    related_contacts: z.array(z.string()).optional(),
    related_jobs: z.array(z.string()).optional(),
    related: z.array(z.object({
        id: z.string()
    })).optional(), // Format from curl example
}).passthrough();

createTool(
    "jobnimbus_update_task",
    UpdateTaskInputSchema,
    'put',
    (input) => `/tasks/${input.id}`,
    (input) => {
        const { id, ...updateData } = input;
        return updateData;
    }
);

// --- Products API Tools (v2 endpoint) ---

const productsApiBase = "/api1/v2"; // Note the different base for products

// Helper specific for product API calls
function createProductTool<TInputSchema extends z.ZodObject<any>, TOutput>(
    name: string,
    inputSchema: TInputSchema,
    apiMethod: 'get' | 'post' | 'put',
    endpointTemplate: string | ((input: z.infer<TInputSchema>) => string),
    inputTransformer?: (input: z.infer<TInputSchema>) => unknown
) {
    server.tool(name, inputSchema.shape, async (args, extra) => {
        const input = args;
        const endpointPath = typeof endpointTemplate === 'function'
            ? endpointTemplate(input)
            : endpointTemplate;
        const fullEndpoint = `${productsApiBase}${endpointPath}`; // Prepend v2 base

        const params = apiMethod === 'get' ? input : undefined;
        const data = (apiMethod === 'post' || apiMethod === 'put')
            ? (inputTransformer ? inputTransformer(input) : input)
            : undefined;

        try {
            // Use the main callJobNimbusApi, but provide the full endpoint
            const result = await callJobNimbusApi<TOutput>(apiMethod, fullEndpoint, params, data);
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error calling ${name}: ${error.message || JSON.stringify(error)}`,
                }],
                isError: true,
            };
        }
    });
}

// 1. List Products
const ListProductsInputSchema = z.object({
    page: z.number().int().optional(),
    size: z.number().int().optional(),
    search: z.string().optional(),
    sort_by: z.string().optional(),
    sort_dir: z.enum(["ASC", "DESC"]).optional(),
    category: z.string().optional(),
    status: z.string().optional(),
}).strict();
createProductTool("jobnimbus_list_products", ListProductsInputSchema, 'get', '/products');

// 2. Get Product
const GetProductInputSchema = z.object({
    id: z.string(), // JNID of the product
}).strict();
createProductTool("jobnimbus_get_product", GetProductInputSchema, 'get', (input) => `/products/${input.id}`);

// 3. Create Product
// Updated to match the actual API schema with UOMs and pricing structure
const CreateProductInputSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    sku: z.string().optional(),
    // New fields from the curl example
    location_id: z.number().int().optional(),
    is_active: z.boolean().optional(),
    tax_exempt: z.boolean().optional(),
    item_type: z.string().optional(), // e.g., "labor+material", "material", "labor"
    suppliers: z.array(z.any()).optional(), // Array of suppliers
    // Multiple Units of Measure with nested pricing
    uoms: z.array(z.object({
        uom: z.string(), // e.g., "SQ YD", "Labor"
        material: z.object({
            cost: z.number(),
            price: z.number()
        })
    })).optional(),
    // Keep these for backward compatibility
    price: z.number().optional(),
    cost: z.number().optional(),
    category: z.string().optional(),
    status: z.string().optional(), // e.g., "Active"
    unit_of_measure: z.string().optional(),
    tax_rate: z.number().optional(),
}).passthrough();
createProductTool("jobnimbus_create_product", CreateProductInputSchema, 'post', '/products');

// 4. Update Product
const UpdateProductInputSchema = z.object({
    id: z.string(), // JNID of the product to update
    // All fields optional for update
    name: z.string().optional(),
    description: z.string().optional(),
    sku: z.string().optional(),
    jnid: z.string().optional(), // Some APIs include jnid in the body
    // New fields from the curl example
    location_id: z.number().int().optional(),
    is_active: z.boolean().optional(),
    tax_exempt: z.boolean().optional(),
    item_type: z.string().optional(), // e.g., "labor+material", "material", "labor"
    suppliers: z.array(z.any()).optional(), // Array of suppliers
    // Multiple Units of Measure with nested pricing
    uoms: z.array(z.object({
        uom: z.string(), // e.g., "SQ YD", "Labor"
        material: z.object({
            cost: z.number(),
            price: z.number()
        })
    })).optional(),
    // Keep backward compatibility fields
    price: z.number().optional(),
    cost: z.number().optional(),
    category: z.string().optional(),
    status: z.string().optional(),
    unit_of_measure: z.string().optional(),
    tax_rate: z.number().optional(),
    inventory_count: z.number().int().optional(),
}).passthrough();

createProductTool(
    "jobnimbus_update_product",
    UpdateProductInputSchema,
    'put',
    (input) => `/products/${input.id}`,
    (input) => {
        const { id, ...updateData } = { ...input };
        return updateData;
    }
);

// --- Invoices API Tools ---

// 1. List Invoices
const ListInvoicesInputSchema = z.object({
    page: z.number().int().optional(),
    size: z.number().int().optional(),
    search: z.string().optional(),
    sort_by: z.string().optional(),
    sort_dir: z.enum(["ASC", "DESC"]).optional(),
    primary_id: z.string().optional(), // Filter by primary contact/customer JNID
    job_id: z.string().optional(), // Filter by related job JNID
    status: z.string().optional(), // Filter by invoice status ("Draft", "Sent", "Paid", etc.)
    date_from: z.string().optional(), // Filter by date range start
    date_to: z.string().optional(), // Filter by date range end
}).strict();
createTool("jobnimbus_list_invoices", ListInvoicesInputSchema, 'get', '/invoices');

// 2. Get Invoice
const GetInvoiceInputSchema = z.object({
    id: z.string(), // JNID of the invoice
}).strict();
createTool("jobnimbus_get_invoice", GetInvoiceInputSchema, 'get', (input) => `/invoices/${input.id}`);

// 3. Create Invoice
const CreateInvoiceInputSchema = z.object({
    // Basic invoice details
    type: z.string().default("invoice").optional(), // Type of record
    number: z.string().optional(), // Invoice number
    title: z.string().optional(), // Invoice title
    description: z.string().optional(), // Invoice description
    status: z.union([z.string(), z.number()]).optional(), // Invoice status (e.g., "Draft", "Sent" or numeric ID)
    date: z.string().optional(), // Invoice date (ISO format)
    date_invoice: z.number().optional(), // Invoice date in Unix timestamp
    date_due: z.number().optional(), // Due date in Unix timestamp
    date_created: z.number().optional(), // Creation date in Unix timestamp
    date_updated: z.number().optional(), // Last update date in Unix timestamp
    due_date: z.string().optional(), // Due date (ISO format) - alternative to date_due
    terms: z.string().optional(), // Payment terms
    external_id: z.string().optional(), // External ID
    is_active: z.boolean().optional(), // Whether the invoice is active
    internal_note: z.string().optional(), // Internal notes
    
    // Amounts and totals
    subtotal: z.number().optional(), // Subtotal amount
    tax_amount: z.number().optional(), // Tax amount
    tax_rate: z.number().optional(), // Tax rate percentage
    discount_amount: z.number().optional(), // Discount amount
    discount_rate: z.number().optional(), // Discount rate percentage
    total: z.number().optional(), // Total amount
    
    // Related entities
    primary_id: z.string().optional(), // Customer JNID
    primary: z.object({
        id: z.string()
    }).optional(), // Alternative format for customer
    job_id: z.string().optional(), // Related job JNID
    job: z.object({
        id: z.string()
    }).optional(), // Alternative format for job
    related: z.array(z.object({
        id: z.string(),
        type: z.string()
    })).optional(), // Related records like jobs
    
    // Line items - API format only
    items: z.array(z.object({
        jnid: z.string().optional(), // JNID of product
        name: z.string(), // Line item name
        description: z.string().optional(), // Line item description
        quantity: z.number(), // Quantity
        price: z.number(), // Unit price
        uom: z.string().optional(), // Unit of measure
        item_type: z.string().optional(), // Item type (e.g., "material", "labor")
    })).optional(),
}).passthrough();

// Transform input for create invoice
createTool(
    "jobnimbus_create_invoice",
    CreateInvoiceInputSchema,
    'post',
    '/invoices',
    (input) => {
        // Create a copy to avoid modifying the original input
        const transformedInput = { ...input };
        
        // Transform primary_id to nested format if needed
        if (transformedInput.primary_id && !transformedInput.primary) {
            transformedInput.primary = { id: transformedInput.primary_id };
            delete transformedInput.primary_id;
        }
        
        // Transform job_id to nested format if needed
        if (transformedInput.job_id && !transformedInput.job) {
            transformedInput.job = { id: transformedInput.job_id };
            delete transformedInput.job_id;
        }
        
        return transformedInput;
    }
);

// 4. Update Invoice
const UpdateInvoiceInputSchema = z.object({
    id: z.string(), // JNID of the invoice to update
    // All fields are optional for update
    type: z.string().default("invoice").optional(), // Type of record
    number: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.union([z.string(), z.number()]).optional(), // Status can be string or number
    date: z.string().optional(),
    date_invoice: z.number().optional(), // Invoice date in Unix timestamp
    date_due: z.number().optional(), // Due date in Unix timestamp
    date_created: z.number().optional(), // Creation date in Unix timestamp
    date_updated: z.number().optional(), // Last update date in Unix timestamp
    due_date: z.string().optional(),
    terms: z.string().optional(),
    external_id: z.string().optional(), // External ID
    is_active: z.boolean().optional(), // Whether the invoice is active
    internal_note: z.string().optional(), // Internal notes
    
    subtotal: z.number().optional(),
    tax_amount: z.number().optional(),
    tax_rate: z.number().optional(),
    discount_amount: z.number().optional(),
    discount_rate: z.number().optional(),
    total: z.number().optional(),
    
    primary_id: z.string().optional(),
    primary: z.object({
        id: z.string()
    }).optional(),
    job_id: z.string().optional(),
    job: z.object({
        id: z.string()
    }).optional(),
    related: z.array(z.object({
        id: z.string(),
        type: z.string()
    })).optional(), // Related records like jobs
    
    // Line items - API format only
    items: z.array(z.object({
        id: z.string().optional(), // Existing line item ID for updates
        jnid: z.string().optional(), // JNID of product
        name: z.string().optional(), // Line item name
        description: z.string().optional(), // Line item description
        quantity: z.number().optional(), // Quantity
        price: z.number().optional(), // Unit price
        uom: z.string().optional(), // Unit of measure
        item_type: z.string().optional(), // Item type (e.g., "material", "labor")
    })).optional(),
}).passthrough();

createTool(
    "jobnimbus_update_invoice",
    UpdateInvoiceInputSchema,
    'put',
    (input) => `/invoices/${input.id}`,
    (input) => {
        // Create a copy to avoid modifying the original input
        const { id, ...updateData } = { ...input };
        
        // Transform primary_id to nested format if needed
        if (updateData.primary_id && !updateData.primary) {
            updateData.primary = { id: updateData.primary_id };
            delete updateData.primary_id;
        }
        
        // Transform job_id to nested format if needed
        if (updateData.job_id && !updateData.job) {
            updateData.job = { id: updateData.job_id };
            delete updateData.job_id;
        }
        
        return updateData;
    }
);

// 5. Send Invoice
const SendInvoiceInputSchema = z.object({
    id: z.string(), // JNID of the invoice to send
    email_to: z.array(z.string().email()).optional(), // Array of email addresses to send to
    cc: z.array(z.string().email()).optional(), // Array of CC email addresses
    bcc: z.array(z.string().email()).optional(), // Array of BCC email addresses
    subject: z.string().optional(), // Email subject
    message: z.string().optional(), // Email message body
    attachments: z.array(z.string()).optional(), // Array of attachment IDs
}).strict();

createTool(
    "jobnimbus_send_invoice",
    SendInvoiceInputSchema,
    'post',
    (input) => `/invoices/${input.id}/send`,
    (input) => {
        const { id, ...sendData } = input;
        return sendData;
    }
);

// 6. Record Payment
const RecordInvoicePaymentInputSchema = z.object({
    id: z.string(), // JNID of the invoice
    amount: z.number(), // Payment amount
    date: z.string(), // Payment date (ISO format)
    method: z.string().optional(), // Payment method (e.g., "Credit Card", "Check", "Cash")
    reference: z.string().optional(), // Payment reference (e.g., check number)
    notes: z.string().optional(), // Payment notes
}).strict();

createTool(
    "jobnimbus_record_invoice_payment",
    RecordInvoicePaymentInputSchema,
    'post',
    (input) => `/invoices/${input.id}/payments`,
    (input) => {
        const { id, ...paymentData } = input;
        return paymentData;
    }
);

// --- Prompts ---

// Job-Contact Relationship prompt
server.prompt(
  "job_contact_relationship",
  { 
    contactInfo: z.string().optional() 
  },
  ({ contactInfo }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `
When creating a job in JobNimbus, remember these important rules:

1. Every job MUST have a primary contact (customer) associated with it
2. The "primary.id" field in the job creation request must contain a valid contact JNID
3. Before creating a job, you must verify if the contact exists:
   - Use jobnimbus_list_contacts with appropriate search parameters
   - If the contact doesn't exist, first create it with jobnimbus_create_contact
   - Use the returned contact JNID in the job creation request

4. Job creation sequence:
   a. Check contact → 
   b. Create contact if needed → 
   c. Create job with contact ID

${contactInfo ? `For the current request, check if this contact exists: ${contactInfo}` : ''}
        `
      }
    }]
  })
);

// --- Connect and Start Server ---
async function startServer() {
    try {
        console.error("Attempting to connect transport...");
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("JobNimbus MCP Server connected via stdio and listening...");
    } catch (error) {
        console.error("Failed to connect MCP server:", error);
        process.exit(1);
    }
}

startServer(); 