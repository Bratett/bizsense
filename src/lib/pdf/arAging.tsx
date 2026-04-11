import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { ArAgingReport, ArAgingCustomer } from '@/lib/reports/arAging'

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page:      { padding: 28, fontFamily: 'Helvetica', fontSize: 8 },
  title:     { fontSize: 14, marginBottom: 3 },
  subtitle:  { fontSize: 8, color: '#6B7280', marginBottom: 14 },
  // Summary totals row
  summary:   { flexDirection: 'row', marginBottom: 14, gap: 8 },
  summaryBox: {
    flex: 1, borderRadius: 4, padding: 8,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
  },
  summaryLabel: { fontSize: 7, color: '#6B7280', marginBottom: 2 },
  summaryValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  // Table
  thead:     { flexDirection: 'row', borderBottom: '1pt solid #E5E7EB', paddingBottom: 3, marginBottom: 2 },
  th:        { fontSize: 7, color: '#6B7280', fontFamily: 'Helvetica-Bold' },
  // Customer header
  custHead:  { flexDirection: 'row', backgroundColor: '#F3F4F6', paddingVertical: 4, paddingHorizontal: 4, marginTop: 6 },
  custName:  { fontSize: 8, fontFamily: 'Helvetica-Bold', flex: 3 },
  custAmt:   { fontSize: 8, fontFamily: 'Helvetica-Bold', flex: 1, textAlign: 'right' },
  // Invoice row
  invRow:    { flexDirection: 'row', paddingVertical: 2, paddingHorizontal: 4, borderBottom: '0.5pt solid #F3F4F6' },
  col1:      { flex: 1.5, fontSize: 7 },
  col2:      { flex: 1.2, fontSize: 7 },
  col3:      { flex: 1.2, fontSize: 7 },
  col4:      { flex: 1, fontSize: 7, textAlign: 'right' },
  col5:      { flex: 1, fontSize: 7, textAlign: 'right' },
  col6:      { flex: 1, fontSize: 7, textAlign: 'right' },
  colBucket: { flex: 1, fontSize: 7, textAlign: 'right' },
  // Grand totals
  gtRow:     { flexDirection: 'row', borderTop: '1pt solid #111827', paddingTop: 4, marginTop: 6 },
  bold:      { fontFamily: 'Helvetica-Bold' },
})

// ─── Document component ───────────────────────────────────────────────────────

function CustomerSection({ customer }: { customer: ArAgingCustomer }) {
  return (
    <View>
      <View style={s.custHead}>
        <Text style={s.custName}>{customer.customerName}</Text>
        <Text style={s.custAmt}>GHS {customer.totals.total.toFixed(2)}</Text>
      </View>
      {customer.invoices.map((inv) => (
        <View key={inv.orderId} style={s.invRow}>
          <Text style={s.col1}>{inv.orderNumber}</Text>
          <Text style={s.col2}>{inv.orderDate}</Text>
          <Text style={s.col3}>{inv.dueDate}</Text>
          <Text style={s.col4}>{inv.originalAmount.toFixed(2)}</Text>
          <Text style={s.col5}>{inv.amountPaid.toFixed(2)}</Text>
          <Text style={s.col6}>{inv.outstanding.toFixed(2)}</Text>
          <Text style={s.colBucket}>{inv.bucket}</Text>
        </View>
      ))}
    </View>
  )
}

export function ArAgingDocument({ data }: { data: ArAgingReport }) {
  const gt = data.grandTotals
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>Accounts Receivable — Aging Report</Text>
        <Text style={s.subtitle}>As at {data.asOfDate} · {data.totalCustomersWithBalance} customer(s) with balance</Text>

        {/* Summary buckets */}
        <View style={s.summary}>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Current (0–30 days)</Text>
            <Text style={s.summaryValue}>{gt.current.toFixed(2)}</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>31–60 days</Text>
            <Text style={s.summaryValue}>{gt.days31to60.toFixed(2)}</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>61–90 days</Text>
            <Text style={s.summaryValue}>{gt.days61to90.toFixed(2)}</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>90+ days</Text>
            <Text style={s.summaryValue}>{gt.over90.toFixed(2)}</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Total Outstanding</Text>
            <Text style={[s.summaryValue, s.bold]}>{gt.total.toFixed(2)}</Text>
          </View>
        </View>

        {/* Column headers */}
        <View style={s.thead}>
          <Text style={[s.th, s.col1]}>Order #</Text>
          <Text style={[s.th, s.col2]}>Order Date</Text>
          <Text style={[s.th, s.col3]}>Due Date</Text>
          <Text style={[s.th, s.col4]}>Original</Text>
          <Text style={[s.th, s.col5]}>Paid</Text>
          <Text style={[s.th, s.col6]}>Outstanding</Text>
          <Text style={[s.th, s.colBucket]}>Bucket</Text>
        </View>

        {/* Customers */}
        {data.customers.map((c) => (
          <CustomerSection key={c.customerId ?? 'walk-in'} customer={c} />
        ))}

        {/* Grand totals */}
        <View style={s.gtRow}>
          <Text style={[s.col1, s.bold]}>TOTAL</Text>
          <Text style={s.col2}></Text>
          <Text style={s.col3}></Text>
          <Text style={s.col4}></Text>
          <Text style={s.col5}></Text>
          <Text style={[s.col6, s.bold]}>{gt.total.toFixed(2)}</Text>
          <Text style={s.colBucket}></Text>
        </View>
      </Page>
    </Document>
  )
}
