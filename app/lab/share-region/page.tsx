import type { Metadata } from "next";
import { LabShareRegionClient } from "./share-region-client";

export const metadata: Metadata = {
  title: "共有リージョン Lab — numanie",
  description:
    "受け取り地域の正規視聴・ネタバレ制御・日本語原典と英訳併記の検証用モック",
  robots: { index: false },
};

export default function LabShareRegionPage() {
  return <LabShareRegionClient />;
}
