/**
 * Calculate price based on tiered pricing (quantity ranges)
 * @param {number} basePrice - Original price per item (fallback)
 * @param {number} quantity - Number of items
 * @param {Array} quantityPricing - Array like [{"min_qty": 1, "max_qty": 1, "price_per_item": 100}, {"min_qty": 2, "max_qty": 5, "price_per_item": 90}, ...]
 * @returns {Object} { totalPrice, pricePerItem, savings, appliedPricing }
 */
function calculateQuantityPrice(basePrice, quantity, quantityPricing = []) {
    if (!Array.isArray(quantityPricing) || quantityPricing.length === 0) {
        const totalPrice = basePrice * quantity;
        return {
            totalPrice,
            pricePerItem: basePrice,
            savings: 0,
            appliedPricing: null,
            isPricing: false,
        };
    }

    // Find the tier that matches this quantity
    // Tier format: { min_qty: 2, max_qty: 5, price_per_item: 90 }
    // max_qty can be null for unlimited
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
            savings: 0,
            appliedPricing: null,
            isPricing: false,
        };
    }

    // Apply tiered pricing
    const pricePerItem = Number(matchingTier.price_per_item);
    const totalPrice = pricePerItem * quantity;
    const regularTotalPrice = basePrice * quantity;
    const savings = regularTotalPrice - totalPrice;

    return {
        totalPrice: Math.round(totalPrice * 100) / 100,
        pricePerItem: Math.round(pricePerItem * 100) / 100,
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
            const savingsPerItem = basePrice - pricePerItem;
            const savingsPercent = basePrice > 0 ? Math.round((savingsPerItem / basePrice) * 100) : 0;

            return {
                min_qty: minQty,
                max_qty: maxQty,
                price_per_item: pricePerItem,
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
        itemsNeeded: Number(nextTier.min_qty || 1) - currentQty,
    };
}

module.exports = {
    calculateQuantityPrice,
    getAvailableQuantityPrices,
    getNextPricingOption,
};

