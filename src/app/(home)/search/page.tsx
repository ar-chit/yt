import { DEFAULT_LIMIT } from "@/constants";
import { SearchView } from "@/modules/search/ui/views/search-view";
import { HydrateClient, trpc } from "@/trpc/server";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    q: string | undefined;
    categoryId: string | undefined;
  }>;
}

const Page = async ({ searchParams }: PageProps) => {
  const { q, categoryId } = await searchParams;

  void trpc.categories.getMany.prefetch();
  void trpc.search.getMany.prefetchInfinite({
    q,
    categoryId,
    limit: DEFAULT_LIMIT,
  });

  return (
    <HydrateClient>
      <SearchView q={q} categoryId={categoryId} />
    </HydrateClient>
  );
};

export default Page;
