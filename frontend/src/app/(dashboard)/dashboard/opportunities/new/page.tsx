import { OpportunityForm } from "@/components/opportunity-form";

export default function NewOpportunityPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Manual opportunity entry
      </h1>
      <OpportunityForm />
    </div>
  );
}
