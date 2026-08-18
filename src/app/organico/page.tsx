import type { Metadata } from "next";

import { ChannelPage, type ChannelPageProps } from "@/app/_shared/channel-page";

export const metadata: Metadata = { title: "Orgânico" };

export default function Page({ searchParams }: ChannelPageProps) {
  return <ChannelPage channel="organico" searchParams={searchParams} />;
}
