"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import type { SigningKeyInfo } from "@/types/api";

interface SigningKeyTableProps {
  keys: SigningKeyInfo[];
}

export function SigningKeyTable({ keys }: SigningKeyTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Key ID</TableHead>
          <TableHead>Public Key</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Activated / Retired</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => (
          <TableRow key={key.id}>
            <TableCell>
              <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                {key.key_id.substring(0, 8)}...
              </code>
            </TableCell>
            <TableCell>
              <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                {key.public_key_hex.substring(0, 12)}...
              </code>
            </TableCell>
            <TableCell>
              {key.is_active ? (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  Active
                </Badge>
              ) : (
                <Badge variant="secondary">Retired</Badge>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {format(new Date(key.created_at), "MMM d, yyyy HH:mm")}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {key.is_active && key.activated_at
                ? formatDistanceToNow(new Date(key.activated_at), {
                    addSuffix: true,
                  })
                : key.retired_at
                  ? format(new Date(key.retired_at), "MMM d, yyyy HH:mm")
                  : "--"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
