import Anthropic from '@anthropic-ai/sdk'

export const AI_TOOLS: Anthropic.Tool[] = [
  // ── WRITE TOOLS ─────────────────────────────────────────────────────────────

  {
    name: 'record_sale',
    description: `Record a sale or invoice. Use when the user says they sold something,
      made a sale, or a customer bought items. Requires: what was sold, payment method
      (or 'credit' if the customer will pay later). If the customer is mentioned, look
      them up. For credit sales, a customer is required.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_name_or_phone: {
          type: 'string',
          description: 'Customer name or phone number to look up. Omit for walk-in cash sales.',
        },
        items: {
          type: 'array',
          description: 'List of items sold',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Product name or description' },
              qty: { type: 'number', description: 'Quantity sold' },
              unit_price: { type: 'number', description: 'Price per unit in GHS' },
            },
            required: ['name', 'qty', 'unit_price'],
          },
        },
        payment_method: {
          type: 'string',
          enum: ['cash', 'mtn_momo', 'telecel', 'airteltigo', 'bank', 'credit'],
          description: 'How the customer paid. Use "credit" if they will pay later.',
        },
        discount_amount: { type: 'number', description: 'Discount in GHS, if any' },
        order_date: {
          type: 'string',
          description: 'Date of sale (ISO format). Defaults to today.',
        },
        notes: { type: 'string', description: 'Optional notes' },
      },
      required: ['items', 'payment_method'],
    },
  },

  {
    name: 'record_expense',
    description: `Record a business expense or payment made. Use when the user says they
      paid for something, spent money, or incurred a cost. Requires: amount, category,
      payment method. Common categories: transport/fuel, rent, utilities, marketing,
      repairs, bank charges, wages, miscellaneous.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description: 'Expense category label (e.g. "Transport & Fuel", "Rent")',
        },
        amount: { type: 'number', description: 'Amount in GHS' },
        payment_method: {
          type: 'string',
          enum: ['cash', 'mtn_momo', 'telecel', 'airteltigo', 'bank'],
        },
        description: { type: 'string', description: 'What the expense was for' },
        supplier_name: {
          type: 'string',
          description: 'Supplier or payee name, if known',
        },
        expense_date: { type: 'string', description: 'Date (ISO). Defaults to today.' },
        includes_vat: {
          type: 'boolean',
          description: 'True if the amount includes VAT (for VAT-registered businesses)',
        },
      },
      required: ['category', 'amount', 'payment_method', 'description'],
    },
  },

  {
    name: 'record_payment_received',
    description: `Record a payment received from a customer against an outstanding invoice.
      Use when the user says a customer paid them, settled a debt, or paid an invoice.
      Look up the customer and their open invoices.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_name_or_phone: { type: 'string', description: 'Customer identifier' },
        amount: { type: 'number', description: 'Amount received in GHS' },
        payment_method: {
          type: 'string',
          enum: ['cash', 'mtn_momo', 'telecel', 'airteltigo', 'bank'],
        },
        invoice_number: {
          type: 'string',
          description:
            'Specific invoice number, if mentioned. Otherwise system finds oldest open invoice.',
        },
        payment_date: { type: 'string', description: 'Date (ISO). Defaults to today.' },
        notes: { type: 'string' },
      },
      required: ['customer_name_or_phone', 'amount', 'payment_method'],
    },
  },

  {
    name: 'add_customer',
    description: `Add a new customer to the system. Use when the user wants to create
      a new customer profile. Phone number is required.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Customer full name or business name' },
        phone: {
          type: 'string',
          description: 'Ghana phone number (e.g. 0244123456)',
        },
        location: {
          type: 'string',
          description: 'Area or town (e.g. "Madina Market")',
        },
        credit_limit: {
          type: 'number',
          description: 'Credit limit in GHS. 0 = cash only.',
        },
      },
      required: ['name', 'phone'],
    },
  },

  {
    name: 'update_customer',
    description: 'Update a field on an existing customer record.',
    input_schema: {
      type: 'object' as const,
      properties: {
        identifier: {
          type: 'string',
          description: 'Customer name or phone to look up',
        },
        field: {
          type: 'string',
          enum: ['phone', 'location', 'credit_limit', 'notes', 'email'],
          description: 'Which field to update',
        },
        value: { type: 'string', description: 'New value' },
      },
      required: ['identifier', 'field', 'value'],
    },
  },

  {
    name: 'add_supplier',
    description: 'Add a new supplier. Use when user wants to create a supplier profile.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        location: { type: 'string' },
      },
      required: ['name', 'phone'],
    },
  },

  {
    name: 'adjust_stock',
    description: `Manually adjust stock quantity for a product. Use when the user reports
      a stockcount correction, damaged goods, or lost inventory. Requires: product name,
      quantity change (positive to add, negative to remove), and reason.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        product_name: { type: 'string', description: 'Product to adjust' },
        quantity_change: {
          type: 'number',
          description: 'Positive = add stock, negative = remove stock',
        },
        reason: {
          type: 'string',
          enum: [
            'Counting error',
            'Damaged / write-off',
            'Theft / shrinkage',
            'Stock received without PO',
            'Donation / give-away',
            'Other',
          ],
        },
        notes: { type: 'string' },
      },
      required: ['product_name', 'quantity_change', 'reason'],
    },
  },

  // ── READ TOOLS ──────────────────────────────────────────────────────────────

  {
    name: 'query_sales',
    description: `Query sales data for a given period. Use for questions like "how much
      did we sell today/this week/this month?", "what were our top products?",
      "show me sales for customer X".`,
    input_schema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: [
            'today',
            'this_week',
            'this_month',
            'last_month',
            'this_quarter',
            'this_year',
            'custom',
          ],
          description: 'Time period for the query',
        },
        date_from: {
          type: 'string',
          description: 'ISO date, required if period = custom',
        },
        date_to: { type: 'string', description: 'ISO date, required if period = custom' },
        group_by: {
          type: 'string',
          enum: ['total', 'product', 'customer', 'day'],
          description: 'How to aggregate results',
        },
        customer_name: {
          type: 'string',
          description: 'Filter to a specific customer',
        },
      },
      required: ['period'],
    },
  },

  {
    name: 'query_expenses',
    description: `Query expense data. Use for questions like "how much did I spend this month?",
      "what were my fuel costs?", "show me all expenses last week".`,
    input_schema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: [
            'today',
            'this_week',
            'this_month',
            'last_month',
            'this_quarter',
            'this_year',
            'custom',
          ],
        },
        date_from: { type: 'string' },
        date_to: { type: 'string' },
        category: {
          type: 'string',
          description: 'Filter to specific expense category',
        },
        group_by: { type: 'string', enum: ['total', 'category', 'day'] },
      },
      required: ['period'],
    },
  },

  {
    name: 'get_cash_position',
    description: `Get current cash, MoMo, and bank balances. Use for questions like
      "what's my cash balance?", "how much do I have in MoMo?", "what's my cash position?".
      No parameters needed.`,
    input_schema: { type: 'object' as const, properties: {} },
  },

  {
    name: 'get_profit',
    description: `Get profit and loss summary for a period. Use for questions like
      "what's my profit this month?", "did we make money last quarter?",
      "what's my net profit for October?".`,
    input_schema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: [
            'today',
            'this_week',
            'this_month',
            'last_month',
            'this_quarter',
            'this_year',
            'custom',
          ],
        },
        date_from: { type: 'string' },
        date_to: { type: 'string' },
      },
      required: ['period'],
    },
  },

  {
    name: 'get_customer_balance',
    description: `Get the outstanding balance owed by a specific customer. Use for
      "how much does Kofi owe me?", "what's Mensah's balance?".`,
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_name_or_phone: { type: 'string' },
      },
      required: ['customer_name_or_phone'],
    },
  },

  {
    name: 'check_stock',
    description: `Check current stock level for a product. Use for "how many bags of
      rice do I have?", "is [product] in stock?", "low stock?" (omit product_name
      to get all low-stock items).`,
    input_schema: {
      type: 'object' as const,
      properties: {
        product_name: {
          type: 'string',
          description: 'Product name. Omit to get all low-stock items.',
        },
      },
    },
  },

  {
    name: 'generate_report',
    description: `Tell the user where to find a specific report and give a brief
      text summary. Use when the user asks for a P&L, balance sheet, VAT report, etc.
      Returns a report URL to display as a link.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        report_type: {
          type: 'string',
          enum: [
            'profit_and_loss',
            'balance_sheet',
            'trial_balance',
            'cash_flow',
            'ar_aging',
            'vat_report',
            'sales_report',
            'expense_report',
            'inventory_valuation',
          ],
        },
        period: {
          type: 'string',
          description: 'Period label (e.g. "this month", "Q1 2026")',
        },
      },
      required: ['report_type'],
    },
  },
]
