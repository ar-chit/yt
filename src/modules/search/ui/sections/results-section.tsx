"use client";

import { InfiniteScroll } from "@/components/infinite-scroll";
import { DEFAULT_LIMIT } from "@/constants";
import { useIsMobile } from "@/hooks/use-mobile";
import { VideoGridCard, VideoGridCardSkeleton } from "@/modules/videos/ui/components/video-grid-card";
import {
  VideoRowCard,
  VideoRowCardSkeleton,
} from "@/modules/videos/ui/components/video-row-card";
import { trpc } from "@/trpc/client";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";

interface ResultsSectionProps {
  q: string | undefined;
  categoryId: string | undefined;
}

export const ResultsSection = ({ q, categoryId }: ResultsSectionProps) => {
  return (
    <Suspense key={`${q}-${categoryId}`} fallback={<ResultsSectionSkeleton />}>
      <ErrorBoundary fallback={<p>Error</p>}>
        <ResultsSectionSuspense q={q} categoryId={categoryId} />
      </ErrorBoundary>
    </Suspense>
  );
};

const ResultsSectionSkeleton = () => {
  return (
    <div>
      <div className="=hidden flex-col gap-4 md:flex">
        {Array.from({ length: 5 }).map((_, idx) => (
          <VideoRowCardSkeleton key={idx} />
        ))}
      </div>
      <div className="=flex flex-col gap-4 p-4 gap-y-10 pt-6 md:hidden">
        {Array.from({ length: 5 }).map((_, idx) => (
          <VideoGridCardSkeleton key={idx} />
        ))}
      </div>
    </div>
  );
};

const ResultsSectionSuspense = ({ q, categoryId }: ResultsSectionProps) => {
  const isMobile = useIsMobile();
  const [results, resultsQuery] = trpc.search.getMany.useSuspenseInfiniteQuery(
    {
      q,
      categoryId,
      limit: DEFAULT_LIMIT,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  return (
    <>
      {isMobile ? (
        <div className="flex flex-col gap-4 gap-y-10">
          {results.pages
            .flatMap((page) => page.items)
            .map((video) => (
              <VideoGridCard key={video.id} data={video} />
            ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {results.pages
            .flatMap((page) => page.items)
            .map((video) => (
              <VideoRowCard key={video.id} data={video} />
            ))}
        </div>
      )}
      <InfiniteScroll
        fetchNextPage={resultsQuery.fetchNextPage}
        hasNextPage={resultsQuery.hasNextPage}
        isFetchingNextPage={resultsQuery.isFetchingNextPage}
      />
    </>
  );
};
