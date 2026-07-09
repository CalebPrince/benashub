import json
import secrets

from werkzeug.security import generate_password_hash


def seed(conn, config):
    cur = conn.cursor()

    categories = [
        ("Household Cleaning", "household-cleaning", "Natural cleaning products for the home.", 1),
        ("Organic Skincare & Health", "organic-skincare-health", "Skincare and wellness essentials.", 2),
        ("Personal Care", "personal-care", "Everyday personal care products.", 3),
        ("Home Essentials", "home-essentials", "Everyday household essentials.", 4),
        ("Organic Foods & Pantry", "organic-foods-pantry", "Organic pantry staples.", 5),
    ]
    cat_ids = {}
    for name, slug, desc, order in categories:
        cur.execute(
            "INSERT INTO categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)",
            (name, slug, desc, order),
        )
        cat_ids[slug] = cur.lastrowid

    # (name, slug, category_slug, description, price_ghs, stock, ships_internationally)
    products = [
        ("Natural Multi-Surface Cleaner", "natural-multi-surface-cleaner", "household-cleaning",
         "Plant-based cleaner safe for kitchen and bathroom surfaces.", 35.00, 40, 0),
        ("Lemon & Vinegar Floor Cleaner", "lemon-vinegar-floor-cleaner", "household-cleaning",
         "Concentrated organic floor cleaner with a fresh citrus scent.", 28.00, 35, 0),
        ("Charcoal Dish Soap Bar", "charcoal-dish-soap-bar", "household-cleaning",
         "Activated charcoal dish soap bar, tough on grease.", 18.00, 50, 1),
        ("Shea Butter Body Lotion", "shea-butter-body-lotion", "organic-skincare-health",
         "Pure Ghanaian shea butter lotion for deep hydration.", 45.00, 30, 1),
        ("Organic Moringa Powder", "organic-moringa-powder", "organic-skincare-health",
         "Nutrient-rich moringa leaf powder.", 55.00, 25, 1),
        ("Aloe Vera Soothing Gel", "aloe-vera-soothing-gel", "organic-skincare-health",
         "Cold-pressed aloe vera gel for skin and hair.", 32.00, 20, 1),
        ("Coconut Oil Soap Bar", "coconut-oil-soap-bar", "personal-care",
         "Cold-processed coconut oil soap bar.", 15.00, 60, 1),
        ("Charcoal Whitening Toothpaste", "charcoal-whitening-toothpaste", "personal-care",
         "Natural activated charcoal toothpaste.", 22.00, 45, 1),
        ("Black Soap & Loofah Set", "black-soap-loofah-set", "personal-care",
         "Traditional African black soap paired with a natural loofah.", 30.00, 30, 0),
        ("Bamboo Kitchen Towel Set", "bamboo-kitchen-towel-set", "home-essentials",
         "Reusable washable bamboo kitchen towels, pack of 3.", 40.00, 25, 0),
        ("Eco-Friendly Storage Jars (Set of 3)", "eco-storage-jars-set", "home-essentials",
         "Glass pantry storage jars with bamboo lids.", 65.00, 15, 0),
        ("Organic Moringa Tea", "organic-moringa-tea", "organic-foods-pantry",
         "Caffeine-free organic moringa leaf tea bags, box of 20.", 38.00, 30, 1),
        ("Cold-Pressed Coconut Oil", "cold-pressed-coconut-oil", "organic-foods-pantry",
         "Virgin cold-pressed coconut oil, 500ml.", 42.00, 28, 1),
    ]
    for name, slug, cat_slug, desc, price_ghs, stock, ships_intl in products:
        cur.execute(
            """INSERT INTO products
               (category_id, name, slug, description, price_pesewas, stock_qty, ships_internationally, is_active, image_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)""",
            (cat_ids[cat_slug], name, slug, desc, round(price_ghs * 100), stock, ships_intl,
             "/static/img/products/placeholder.svg"),
        )

    shipping_rates = [
        ("Ghana (Domestic)", "domestic", ["Ghana"], 1500, 500),
        ("West Africa", "international",
         ["Nigeria", "Togo", "Benin", "Cote d'Ivoire", "Senegal", "Burkina Faso", "Sierra Leone", "Liberia"],
         6000, 2000),
        ("Rest of World", "international",
         ["United States", "United Kingdom", "Canada", "Germany", "France", "Netherlands", "Australia",
          "South Africa"],
         12000, 3500),
    ]
    for zone_name, zone_type, countries, base, per_item in shipping_rates:
        cur.execute(
            """INSERT INTO shipping_rates (zone_name, zone_type, countries, base_rate_pesewas,
               per_item_rate_pesewas, is_active) VALUES (?, ?, ?, ?, ?, 1)""",
            (zone_name, zone_type, json.dumps(countries), base, per_item),
        )

    admin_username = config.get("ADMIN_USERNAME", "admin")
    admin_password = config.get("ADMIN_PASSWORD")
    generated = False
    if not admin_password:
        admin_password = secrets.token_urlsafe(9)
        generated = True
    cur.execute(
        "INSERT INTO admin_users (username, password_hash) VALUES (?, ?)",
        (admin_username, generate_password_hash(admin_password)),
    )

    print("=" * 64)
    print("Benas Hub: database created and seeded.")
    print(f"  Admin username: {admin_username}")
    if generated:
        print(f"  Admin password: {admin_password}  (auto-generated, save this now)")
    else:
        print("  Admin password: <taken from ADMIN_PASSWORD env var>")
    print("=" * 64)
