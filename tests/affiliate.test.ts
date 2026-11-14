import assert from "node:assert/strict";
import test from "node:test";
import { buildEbayAffiliateUrl } from "../src/play/affiliate";

test("tracked link keeps the original item and adds every EPN param", () => {
  const url = buildEbayAffiliateUrl({
    itemUrl: "https://www.ebay.com/sch/i.html?_nkw=plasma+globe",
    campid: "1234567890",
    customid: "entry hall/plasma-globe",
  });
  assert.ok(url);
  const parsed = new URL(url);
  assert.equal(parsed.protocol, "https:");
  assert.equal(parsed.hostname, "www.ebay.com");
  assert.equal(parsed.pathname, "/sch/i.html");
  assert.equal(parsed.searchParams.get("_nkw"), "plasma globe");
  assert.equal(parsed.searchParams.get("mkevt"), "1");
  assert.equal(parsed.searchParams.get("mkcid"), "1");
  assert.equal(parsed.searchParams.get("mkrid"), "711-53200-19255-0");
  assert.equal(parsed.searchParams.get("campid"), "1234567890");
  assert.equal(parsed.searchParams.get("toolid"), "10001");
  assert.equal(parsed.searchParams.get("customid"), "entryhallplasma-globe");
});

test("tracked link keeps an item path", () => {
  const url = buildEbayAffiliateUrl({
    itemUrl: "https://www.ebay.com/itm/123456789012?_trkparms=abc",
    campid: "55556666",
    customid: "room-2",
  });
  assert.ok(url);
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/itm/123456789012");
  assert.equal(parsed.searchParams.get("_trkparms"), "abc");
  assert.equal(parsed.searchParams.get("campid"), "55556666");
});

test("link builder refuses non-ebay hosts and a missing campaign id", () => {
  const cases = [
    "https://evil.com/itm/1",
    "https://ebay.com.evil.com/itm/1",
    "https://notebay.com/itm/1",
    "https://user:pass@www.ebay.com/itm/1",
    "http://www.ebay.com/itm/1",
    "javascript:alert(1)",
  ];
  for (const itemUrl of cases) {
    assert.equal(
      buildEbayAffiliateUrl({ itemUrl, campid: "1234567890", customid: "x" }),
      null,
      itemUrl,
    );
  }
  assert.equal(
    buildEbayAffiliateUrl({
      itemUrl: "https://www.ebay.com/itm/1",
      campid: "",
      customid: "x",
    }),
    null,
  );
  assert.equal(
    buildEbayAffiliateUrl({
      itemUrl: "https://www.ebay.com/itm/1",
      campid: undefined,
      customid: "x",
    }),
    null,
  );
  assert.equal(
    buildEbayAffiliateUrl({
      itemUrl: "https://www.ebay.com/itm/1",
      campid: "not-a-camp",
      customid: "x",
    }),
    null,
  );
});
