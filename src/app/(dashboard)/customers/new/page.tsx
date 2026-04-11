import CustomerForm from './page.client'

export default function NewCustomerPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <CustomerForm />
      </div>
    </main>
  )
}
