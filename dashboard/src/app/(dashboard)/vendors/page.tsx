"use client";

import { VendorList } from "@/components/vendors/VendorList";

export default function VendorsPage() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vendor Management</h1>
        <p className="text-muted-foreground mt-1">
          Approve or block AI vendors and manage model allowlists
        </p>
      </div>
      <VendorList />
    </div>
  );
}
