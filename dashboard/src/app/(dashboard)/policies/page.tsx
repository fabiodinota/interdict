import { PolicyList } from "@/components/policies/PolicyList";

export default function PoliciesPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Policies</h1>
        <p className="text-muted-foreground mt-1">
          Manage governance policies and their enforcement rules
        </p>
      </div>
      <PolicyList />
    </div>
  );
}
