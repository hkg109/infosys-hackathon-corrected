import { notFound } from "next/navigation";
import { InputStep } from "@/features/planner/components/InputSteps";
import { INPUT_STEPS, type StepId } from "@/features/planner/inputSteps";

export function generateStaticParams() {
  return INPUT_STEPS.filter((s) => s.id !== "basic").map((s) => ({ step: s.id }));
}

export default async function Page({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  if (!INPUT_STEPS.some((s) => s.id === step) || step === "basic") notFound();
  return <InputStep step={step as StepId} />;
}
