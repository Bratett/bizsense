/**
 * Generate CSV template strings with headers and 2 example rows
 * using realistic Ghanaian SME data.
 */

export function generateProductsTemplate(): string {
  return [
    'name,sku,category,unit,cost_price,selling_price,reorder_level',
    'Rice 50kg Bag,RICE50,Grains,bag,120.00,145.00,5',
    'Peak Milk Tin (400g),PEAK400,Beverages,piece,18.50,22.00,20',
  ].join('\n')
}

export function generateCustomersTemplate(): string {
  return [
    'name,phone,location,credit_limit',
    'Abena Serwaa,0244123456,Kumasi Market,500.00',
    'Kofi Mensah,0201234567,Accra - Madina,1000.00',
  ].join('\n')
}

export function generateInvoicesTemplate(): string {
  return [
    'customer_name,customer_phone,invoice_amount,invoice_date,due_date',
    'Kofi Mensah,0201234567,1200.00,01/04/2026,30/04/2026',
    'Ama Boateng,0551234567,850.00,15/03/2026,14/04/2026',
  ].join('\n')
}
