const fs = require('fs');
let code = fs.readFileSync('src/controllers/orderController.js', 'utf8');

const regex = /\/\/ Determine Shipping Zone[\s\S]*?\n        const subtotal = toMoney\(itemsSubtotal\);/;

const replacement = `// Determine default origin from site settings
        const defaultOriginCity = settings.shipping_origin_city || "Ernakulam";
        const defaultOriginState = settings.shipping_origin_state || "Kerala";

        let itemsSubtotal = 0;
        let totalDiscount = 0;
        let totalShippingCost = 0;
        const itemsWithPricing = [];

        // Group items by origin
        const originGroups = {};

        for (const item of items) {
            const p = byId.get(item.product_id);
            const basePrice = Number(p.price);
            const quantity = Number(item.quantity || 1);
            const weight = Number(p.weight ?? 0);
            const volWeight = Number(p.volumetric_weight ?? 0);
            const extraShippingCharge = Number(p.extra_shipping_charge ?? 0);
            const chargeableWeight = Math.max(weight, volWeight);

            // Determine item's specific origin or fallback to default
            const itemOriginCity = p.origin_city || defaultOriginCity;
            const itemOriginState = p.origin_state || defaultOriginState;
            const originKey = \`\${itemOriginCity}_\${itemOriginState}\`.toLowerCase();

            // Determine Shipping Zone for this specific item's origin
            let zone = "national";
            if (customer?.city?.trim().toLowerCase() === itemOriginCity.trim().toLowerCase()) {
                zone = "local";
            } else if (customer?.state?.trim().toLowerCase() === itemOriginState.trim().toLowerCase()) {
                zone = "regional";
            }

            // Initialize origin group if it doesn't exist
            if (!originGroups[originKey]) {
                originGroups[originKey] = {
                    zone: zone,
                    totalWeight: 0
                };
            }

            if (p.product_type === 'physical') {
                originGroups[originKey].totalWeight += chargeableWeight * quantity;
                totalShippingCost += extraShippingCharge * quantity; // Base extra charges accumulated
            }

            // Calculate pricing for this quantity and zone
            const pricingInfo = calculateQuantityPrice(
                basePrice,
                quantity,
                p.tiered_pricing || [],
                zone
            );

            const itemItemsTotal = pricingInfo.itemsTotal;
            const itemSavings = pricingInfo.savings;

            itemsSubtotal += itemItemsTotal;
            totalDiscount += itemSavings;
            totalShippingCost += pricingInfo.courierCharge * quantity;

            itemsWithPricing.push({
                ...item,
                basePrice,
                totalPrice: pricingInfo.totalPrice, // Items + Shipping for this item
                pricePerItem: pricingInfo.pricePerItem,
                courierCharge: pricingInfo.courierCharge, // Restored item-level tracking
                savings: itemSavings,
                isPricing: pricingInfo.isPricing,
                appliedPricing: pricingInfo.appliedPricing,
            });
        }

        // Calculate weight-based shipping slabs per origin group
        for (const originKey in originGroups) {
            const group = originGroups[originKey];
            const zone = group.zone;
            const weight = group.totalWeight;

            if (weight > 0) {
                let baseWeight, baseRate, addWeight, addRate;

                if (zone === 'local') {
                    baseWeight = Number(settings.local_base_weight || 1000);
                    baseRate = Number(settings.local_base_rate || 50);
                    addWeight = Number(settings.local_additional_weight || 1000);
                    addRate = Number(settings.local_additional_rate || 40);
                } else if (zone === 'regional') {
                    baseWeight = Number(settings.regional_base_weight || 1000);
                    baseRate = Number(settings.regional_base_rate || 70);
                    addWeight = Number(settings.regional_additional_weight || 1000);
                    addRate = Number(settings.regional_additional_rate || 60);
                } else {
                    baseWeight = Number(settings.national_base_weight || 1000);
                    baseRate = Number(settings.national_base_rate || 100);
                    addWeight = Number(settings.national_additional_weight || 1000);
                    addRate = Number(settings.national_additional_rate || 90);
                }

                if (weight <= baseWeight) {
                    totalShippingCost += baseRate;
                } else {
                    const extraWeight = weight - baseWeight;
                    const extraSlabs = Math.ceil(extraWeight / addWeight);
                    totalShippingCost += baseRate + (extraSlabs * addRate);
                }
            }
        }

        const subtotal = toMoney(itemsSubtotal);`;

if (regex.test(code)) {
    code = code.replace(regex, replacement);
    fs.writeFileSync('src/controllers/orderController.js', code, 'utf8');
    console.log("Successfully updated orderController.js with origin grouping logic.");
} else {
    console.log("Regex pattern not found in orderController.js");
}
