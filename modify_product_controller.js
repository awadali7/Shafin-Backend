const fs = require('fs');

let content = fs.readFileSync('src/controllers/productController.js', 'utf8');

// 1. Update SELECT queries handling alias "p"
content = content.replace(
  /                p\.weight,\n                p\.volumetric_weight,\n                p\.extra_shipping_charge,\n                p\.created_at,/g,
  `                p.weight,\n                p.volumetric_weight,\n                p.extra_shipping_charge,\n                p.origin_city,\n                p.origin_state,\n                p.origin_pincode,\n                p.created_at,`
);

// 2. Update SELECT queries without alias
content = content.replace(
  /                weight,\n                volumetric_weight,\n                extra_shipping_charge,\n                created_at,/g,
  `                weight,\n                volumetric_weight,\n                extra_shipping_charge,\n                origin_city,\n                origin_state,\n                origin_pincode,\n                created_at,`
);

// 3. Destructuring in adminCreateProduct and adminUpdateProduct
content = content.replace(
  /                weight_slabs_config,\n        \} = req\.body \|\| \{\};/g,
  `                weight_slabs_config,\n                origin_city,\n                origin_state,\n                origin_pincode,\n        } = req.body || {};`
);

// 4. INSERT INTO products columns
content = content.replace(
  /                volumetric_weight,\n                extra_shipping_charge,\n                shipping_zones_config,\n                weight_slabs_config\n            \) VALUES \(/,
  `                volumetric_weight,\n                extra_shipping_charge,\n                shipping_zones_config,\n                weight_slabs_config,\n                origin_city,\n                origin_state,\n                origin_pincode\n            ) VALUES (`
);

// 5. INSERT INTO products placeholders
content = content.replace(
  /\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9,\$10,\$11,\$12,\$13,\$14,\$15,\$16,\$17,\$18,\$19,\$20,\$21,\$22,\$23,\$24,\$25,\$26,\$27,\$28,\$29,\$30,\$31,\$32,\$33,\$34\n            \)\n            RETURNING/,
  `$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37\n            )\n            RETURNING`
);

// 6. INSERT VALUES array
content = content.replace(
  /\(weight_slabs_config \? JSON\.stringify\(weight_slabs_config\) \: null\)\n            \]\n        \);/g,
  `(weight_slabs_config ? JSON.stringify(weight_slabs_config) : null),\n                origin_city || null,\n                origin_state || null,\n                origin_pincode || null\n            ]\n        );`
);

// 7. UPDATE columns
content = content.replace(
  /                shipping_zones_config = \$33,\n                weight_slabs_config = \$34,\n                updated_at = NOW\(\)\n             WHERE id = \$35\n             RETURNING/,
  `                shipping_zones_config = $33,\n                weight_slabs_config = $34,\n                origin_city = $35,\n                origin_state = $36,\n                origin_pincode = $37,\n                updated_at = NOW()\n             WHERE id = $38\n             RETURNING`
);

// 8. UPDATE VALUES array
content = content.replace(
  /\(weight_slabs_config \? JSON\.stringify\(weight_slabs_config\) \: null\),\n                id,\n            \]\n        \);/g,
  `(weight_slabs_config ? JSON.stringify(weight_slabs_config) : null),\n                origin_city || null,\n                origin_state || null,\n                origin_pincode || null,\n                id,\n            ]\n        );`
);

fs.writeFileSync('src/controllers/productController.js', content, 'utf8');
console.log('productController.js updated successfully.');
