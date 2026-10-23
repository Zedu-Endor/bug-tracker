import { Bar, CardSkeleton, SkeletonPage } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <SkeletonPage label="Loading settings…">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2.5">
          <Bar className="h-4 w-28" />
          <Bar className="h-8 w-40" />
          <Bar className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex flex-wrap items-start gap-4 lg:gap-6">
          <div className="flex min-w-0 max-w-full flex-[1_1_240px] flex-col gap-1 rounded-[20px] border border-line bg-surface p-2.5">
            {Array.from({ length: 4 }, (_, index) => (
              <Bar key={index} className="h-14 rounded-[14px]" />
            ))}
          </div>
          <div className="min-w-0 flex-[999_1_560px]">
            <CardSkeleton rows={6} />
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
