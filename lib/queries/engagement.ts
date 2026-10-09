import { query, execute } from "../db";
import type { CartItem } from "../types";

export const listWishlistIds = async (sid: string) =>
  (await query<{ product_id: number }>("SELECT product_id FROM wishlist WHERE session_id = ? ORDER BY id DESC", [sid])).map((r) => r.product_id);

export const addWishlist = (sid: string, productId: number) =>
  execute("INSERT IGNORE INTO wishlist (session_id, product_id) VALUES (?, ?)", [sid, productId]);
export const removeWishlist = (sid: string, productId: number) =>
  execute("DELETE FROM wishlist WHERE session_id = ? AND product_id = ?", [sid, productId]);

export const listCart = (sid: string) =>
  query<CartItem>(
    `SELECT ci.id, ci.product_id, ci.qty, ci.size, ci.color, p.name, p.slug, p.price, p.sale_price,
            (SELECT pi.thumb_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id LIMIT 1) AS thumb
     FROM cart_items ci JOIN products p ON p.id = ci.product_id
     WHERE ci.session_id = ? ORDER BY ci.id DESC`,
    [sid],
  );

export const addToCart = (sid: string, productId: number, qty: number, size: string, color: string) =>
  execute(
    `INSERT INTO cart_items (session_id, product_id, qty, size, color) VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE qty = LEAST(qty + VALUES(qty), 20)`,
    [sid, productId, qty, size, color],
  );
export const setCartQty = (sid: string, id: number, qty: number) =>
  execute("UPDATE cart_items SET qty = ? WHERE id = ? AND session_id = ?", [qty, id, sid]);
export const removeCartItem = (sid: string, id: number) =>
  execute("DELETE FROM cart_items WHERE id = ? AND session_id = ?", [id, sid]);
