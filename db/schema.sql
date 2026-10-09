-- MySQL 8 / MariaDB 10.5+ schema. Raw SQL only (no ORM).
CREATE TABLE IF NOT EXISTS categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subcategories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  UNIQUE KEY uq_sub (category_id, slug),
  CONSTRAINT fk_sub_cat FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS brands (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  subcategory_id INT UNSIGNED NULL,
  brand_id INT UNSIGNED NULL,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  sale_price DECIMAL(10,2) NULL,
  stock INT NOT NULL DEFAULT 0,
  rating DECIMAL(2,1) NOT NULL DEFAULT 0,
  rating_count INT NOT NULL DEFAULT 0,
  gender ENUM('women','men','unisex') NOT NULL DEFAULT 'unisex',
  colors JSON NULL,
  sizes JSON NULL,
  shades JSON NULL,
  tryon_type ENUM('garment','face_makeup','accessory') NOT NULL DEFAULT 'garment',
  tryon_region VARCHAR(40) NOT NULL DEFAULT 'torso',
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_prod_cat (category_id),
  INDEX idx_prod_sub (subcategory_id),
  INDEX idx_prod_brand (brand_id),
  INDEX idx_prod_pub (is_published),
  INDEX idx_prod_created (created_at),
  CONSTRAINT fk_prod_cat FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_prod_sub FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE SET NULL,
  CONSTRAINT fk_prod_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_images (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  view ENUM('front','back','side','extra') NOT NULL,
  original_path VARCHAR(300) NOT NULL,
  enhanced_path VARCHAR(300) NOT NULL,
  thumb_path VARCHAR(300) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  INDEX idx_img_prod (product_id, sort_order),
  CONSTRAINT fk_img_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wishlist (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wish (session_id, product_id),
  CONSTRAINT fk_wish_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cart_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  size VARCHAR(40) NOT NULL DEFAULT '',
  color VARCHAR(60) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cart (session_id, product_id, size, color),
  CONSTRAINT fk_cart_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tryon_sessions (
  id VARCHAR(40) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  user_photo_path VARCHAR(300) NOT NULL,
  analysis JSON NULL,
  mask_path VARCHAR(300) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ts_sess (session_id),
  INDEX idx_ts_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tryon_results (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  product_ids JSON NOT NULL,
  result_path VARCHAR(300) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  is_saved TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_tr_sess (session_id),
  INDEX idx_tr_saved (is_saved, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
