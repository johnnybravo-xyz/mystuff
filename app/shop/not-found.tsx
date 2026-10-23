import Link from 'next/link';
export default function ShopNotFound() {
  return (
    <section className="shop-empty">
      <h1>This listing is unavailable.</h1>
      <p>It may have found a new home.</p>
      <Link className="shop-button" href="/shop">
        Back to the shop
      </Link>
    </section>
  );
}
