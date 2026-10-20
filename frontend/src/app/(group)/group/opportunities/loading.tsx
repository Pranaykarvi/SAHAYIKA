import { CardSkeleton, Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <Skeleton className="h-8 w-2/3" />
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}
