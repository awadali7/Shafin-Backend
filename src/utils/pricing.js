const PINCODE_ZONES = {
    metro: [
        { start: 110001, end: 110096, city: 'Delhi' },
        { start: 400001, end: 400104, city: 'Mumbai' },
        { start: 411001, end: 411062, city: 'Pune' },
        { start: 600001, end: 600130, city: 'Chennai' },
        { start: 700001, end: 700160, city: 'Kolkata' },
        { start: 560001, end: 560110, city: 'Bengaluru' },
        { start: 500001, end: 500096, city: 'Hyderabad' },
    ],
    northeast: [
        { start: 781001, end: 788931, state: 'Assam' },
        { start: 790001, end: 792130, state: 'Arunachal Pradesh' },
        { start: 795001, end: 795159, state: 'Manipur' },
        { start: 793001, end: 794115, state: 'Meghalaya' },
        { start: 796001, end: 796901, state: 'Mizoram' },
        { start: 797001, end: 798627, state: 'Nagaland' },
        { start: 737101, end: 737139, state: 'Sikkim' },
        { start: 799001, end: 799290, state: 'Tripura' },
    ],
    remote: [
        { start: 180001, end: 185156, state: 'J&K' },
        { start: 194101, end: 194404, state: 'Ladakh' },
        { start: 172001, end: 172235, state: 'Himachal-Kinnaur' },
        { start: 175001, end: 175049, state: 'Himachal-Lahaul' },
        { start: 176115, end: 176117, state: 'Himachal-Spiti' },
        { start: 744101, end: 744304, state: 'Andaman & Nicobar' },
        { start: 682551, end: 682560, state: 'Lakshadweep' },
    ],
};

/**
 * @param {string|number} pincode
 * @returns {'metro'|'northeast'|'remote'|'standard'}
 */
function getPincodeZoneHint(pincode) {
    const code = parseInt(pincode, 10);
    if (!Number.isFinite(code)) return 'standard';

    for (const range of PINCODE_ZONES.remote) {
        if (code >= range.start && code <= range.end) return 'remote';
    }
    for (const range of PINCODE_ZONES.northeast) {
        if (code >= range.start && code <= range.end) return 'northeast';
    }
    for (const range of PINCODE_ZONES.metro) {
        if (code >= range.start && code <= range.end) return 'metro';
    }
    return 'standard';
}

/**
 * Calculate price based on tiered pricing (quantity ranges) and shipping zone
 * @param {number} basePrice - Original price per item (fallback)
 * @param {number} quantity - Number of items
 * @param {Array} quantityPricing - Array of tier objects; each tier may have courier_charge_a/b/c/d/e/f and a generic courier_charge fallback
 * @param {string} zone - Shipping zone: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
 * @returns {Object} { totalPrice, pricePerItem, courierCharge, itemsTotal, savings, appliedPricing }
 */
function calculateQuantityPrice(basePrice, quantity, quantityPricing = [], zone = 'D') {
    if (!Array.isArray(quantityPricing) || quantityPricing.length === 0) {
        const totalPrice = basePrice * quantity;
        return {
            totalPrice,
            pricePerItem: basePrice,
            courierCharge: 0,
            itemsTotal: totalPrice,
            savings: 0,
            appliedPricing: null,
            isPricing: false,
        };
    }

    // Find the tier that matches this quantity
    const matchingTier = quantityPricing.find((tier) => {
        const minQty = Number(tier.min_qty || 1);
        const maxQty = tier.max_qty ? Number(tier.max_qty) : Infinity;
        return quantity >= minQty && quantity <= maxQty;
    });

    if (!matchingTier) {
        // No tier found, use base price
        const totalPrice = basePrice * quantity;
        return {
            totalPrice,
            pricePerItem: basePrice,
            courierCharge: 0,
            itemsTotal: totalPrice,
            savings: 0,
            appliedPricing: null,
            isPricing: false,
        };
    }

    // Apply tiered pricing
    const pricePerItem = Number(matchingTier.price_per_item);

    // Pick zone-specific courier charge; fall back to generic courier_charge for
    // existing DB rows that predate the per-zone fields.
    const ZONE_FIELD = {
        A: 'courier_charge_a',
        B: 'courier_charge_b',
        C: 'courier_charge_c',
        D: 'courier_charge_d',
        E: 'courier_charge_e',
        F: 'courier_charge_f',
    };
    const zoneField = ZONE_FIELD[zone];
    const courierCharge = Number(
        zoneField != null
            ? (matchingTier[zoneField] ?? matchingTier.courier_charge ?? 0)
            : (matchingTier.courier_charge ?? 0)
    );

    const itemsTotal = pricePerItem * quantity;
    const totalPrice = itemsTotal;
    const regularTotalPrice = basePrice * quantity;
    const savings = regularTotalPrice - totalPrice;

    return {
        totalPrice: Math.round(totalPrice * 100) / 100,
        pricePerItem: Math.round(pricePerItem * 100) / 100,
        courierCharge: Math.round(courierCharge * 100) / 100,
        itemsTotal: Math.round(itemsTotal * 100) / 100,
        savings: Math.round(savings * 100) / 100,
        appliedPricing: matchingTier,
        isPricing: true,
    };
}

/**
 * Get all available pricing tiers
 * @param {number} basePrice - Base price per item
 * @param {Array} quantityPricing - Tiered pricing array
 * @returns {Array} Sorted array of pricing tiers
 */
function getAvailableQuantityPrices(basePrice, quantityPricing = []) {
    if (!Array.isArray(quantityPricing) || quantityPricing.length === 0) {
        return [];
    }

    return quantityPricing
        .map((tier) => {
            const minQty = Number(tier.min_qty || 1);
            const maxQty = tier.max_qty ? Number(tier.max_qty) : null;
            const pricePerItem = Number(tier.price_per_item);
            const courierCharge = Number(tier.courier_charge || 0);
            const savingsPerItem = basePrice - pricePerItem;
            const savingsPercent = basePrice > 0 ? Math.round((savingsPerItem / basePrice) * 100) : 0;

            return {
                min_qty: minQty,
                max_qty: maxQty,
                price_per_item: pricePerItem,
                courier_charge: courierCharge,
                savings_per_item: Math.round(savingsPerItem * 100) / 100,
                savings_percent: savingsPercent,
            };
        })
        .sort((a, b) => a.min_qty - b.min_qty);
}

/**
 * Get next better pricing tier (to encourage users to buy more)
 * @param {number} currentQty - Current quantity
 * @param {Array} quantityPricing - Tiered pricing array
 * @returns {Object|null} Next tier or null
 */
function getNextPricingOption(currentQty, quantityPricing = []) {
    if (!Array.isArray(quantityPricing) || quantityPricing.length === 0) {
        return null;
    }

    // Sort by min_qty ascending
    const sorted = [...quantityPricing].sort(
        (a, b) => (a.min_qty || 1) - (b.min_qty || 1)
    );

    // Find first tier with min_qty > current quantity
    const nextTier = sorted.find((tier) => {
        const minQty = Number(tier.min_qty || 1);
        return minQty > currentQty;
    });

    if (!nextTier) {
        return null;
    }

    return {
        min_qty: Number(nextTier.min_qty || 1),
        max_qty: nextTier.max_qty ? Number(nextTier.max_qty) : null,
        price_per_item: Number(nextTier.price_per_item),
        courier_charge: Number(nextTier.courier_charge || 0),
        itemsNeeded: Number(nextTier.min_qty || 1) - currentQty,
    };
}

module.exports = {
    calculateQuantityPrice,
    getAvailableQuantityPrices,
    getNextPricingOption,
    getPincodeZoneHint,
};

