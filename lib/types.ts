export type ViewName = "front" | "back" | "side" | "extra";
export type TryOnType = "garment" | "face_makeup" | "accessory";

export interface Shade { name: string; hex: string }

export interface ProductImage {
  id: number;
  view: ViewName;
  original_path: string;
  enhanced_path: string;
  thumb_path: string;
  sort_order: number;
}

export interface Product {
  id: number;
  category_id: number;
  category_slug: string;
  category_name: string;
  subcategory_id: number | null;
  subcategory_slug: string | null;
  subcategory_name: string | null;
  brand_id: number | null;
  brand_name: string | null;
  brand_slug: string | null;
  name: string;
  slug: string;
  description: string;
  price: number;
  sale_price: number | null;
  stock: number;
  rating: number;
  rating_count: number;
  gender: "women" | "men" | "unisex";
  colors: string[];
  sizes: string[];
  shades: Shade[];
  tryon_type: TryOnType;
  tryon_region: string;
  is_published: number;
  created_at: string;
  cover: string | null;
  cover_thumb: string | null;
  back_image: string | null;
  images?: ProductImage[];
}

export interface Pick {
  productId: number;
  shade?: string; // hex colour for makeup
  shadeName?: string;
}

export interface CartItem {
  id: number;
  product_id: number;
  qty: number;
  size: string;
  color: string;
  name: string;
  slug: string;
  price: number;
  sale_price: number | null;
  thumb: string | null;
}
