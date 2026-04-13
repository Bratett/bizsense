'use client'

import { useState } from 'react'
import { Progress } from '@/components/ui/progress'
import Step1BusinessProfile from './steps/Step1BusinessProfile'
import Step2CashBalances from './steps/Step2CashBalances'
import Step3Inventory from './steps/Step3Inventory'
import Step4Receivables from './steps/Step4Receivables'
import Step5Payables from './steps/Step5Payables'
import Step6Review from './steps/Step6Review'

const STEPS = [
  { number: 1, title: 'Business Profile' },
  { number: 2, title: 'Cash & Bank' },
  { number: 3, title: 'Inventory' },
  { number: 4, title: 'Receivables' },
  { number: 5, title: 'Payables' },
  { number: 6, title: 'Review' },
]

export default function OnboardingWizard() {
  const [step, setStep] = useState(1)

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:py-10">
      {/* Logo + heading */}
      <div className="mb-6 text-center">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-green-700">
          <span className="text-lg font-bold text-white">B</span>
        </div>
        <h1 className="mt-2 text-xl font-semibold text-foreground">Set up your business</h1>
      </div>

      {/* Progress indicator */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Step {step} of {STEPS.length}
          </span>
          <span className="font-medium text-foreground">{STEPS[step - 1].title}</span>
        </div>
        <Progress value={(step / STEPS.length) * 100} className="h-1.5" />
        {/* Step titles row */}
        <div className="mt-2 hidden gap-1 sm:flex">
          {STEPS.map((s) => (
            <span
              key={s.number}
              className={`flex-1 text-center text-[10px] leading-tight ${
                s.number === step
                  ? 'font-medium text-green-700'
                  : s.number < step
                    ? 'text-muted-foreground'
                    : 'text-muted-foreground/40'
              }`}
            >
              {s.title}
            </span>
          ))}
        </div>
      </div>

      {/* Step content */}
      {step === 1 && <Step1BusinessProfile onComplete={() => setStep(2)} />}
      {step === 2 && <Step2CashBalances onComplete={() => setStep(3)} onBack={() => setStep(1)} />}
      {step === 3 && <Step3Inventory onComplete={() => setStep(4)} onBack={() => setStep(2)} />}
      {step === 4 && <Step4Receivables onComplete={() => setStep(5)} onBack={() => setStep(3)} />}
      {step === 5 && <Step5Payables onComplete={() => setStep(6)} onBack={() => setStep(4)} />}
      {step === 6 && <Step6Review onBack={() => setStep(5)} />}
    </div>
  )
}
