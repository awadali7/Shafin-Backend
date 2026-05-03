// Mock DB and side-effect modules before requiring the controller
jest.mock('../src/config/database', () => ({
    query: jest.fn(),
    getClient: jest.fn(),
}));
jest.mock('../src/controllers/notificationController', () => ({
    createNotification: jest.fn(),
}));
jest.mock('../src/config/email', () => ({
    sendOrderConfirmedEmail: jest.fn(),
    sendOrderShippedEmail: jest.fn(),
    sendOrderDeliveredEmail: jest.fn(),
    sendOrderStatusUpdateEmail: jest.fn(),
}));

const {
    getShippingZone,
    buildOrderPricingQuote,
    getOrderQuote,
} = require('../src/controllers/orderController');
const { calculateQuantityPrice, getPincodeZoneHint } = require('../src/utils/pricing');
const { getClient } = require('../src/config/database');

// ---------------------------------------------------------------------------
// getPincodeZoneHint
// ---------------------------------------------------------------------------

describe('getPincodeZoneHint', () => {
    test('110005 → metro (Delhi)', () => {
        expect(getPincodeZoneHint('110005')).toBe('metro');
    });
    test('560020 → metro (Bengaluru)', () => {
        expect(getPincodeZoneHint('560020')).toBe('metro');
    });
    test('600050 → metro (Chennai)', () => {
        expect(getPincodeZoneHint('600050')).toBe('metro');
    });
    test('785001 → northeast (Assam)', () => {
        expect(getPincodeZoneHint('785001')).toBe('northeast');
    });
    test('795010 → northeast (Manipur)', () => {
        expect(getPincodeZoneHint('795010')).toBe('northeast');
    });
    test('182001 → remote (J&K)', () => {
        expect(getPincodeZoneHint('182001')).toBe('remote');
    });
    test('744102 → remote (Andaman)', () => {
        expect(getPincodeZoneHint('744102')).toBe('remote');
    });
    test('682555 → remote (Lakshadweep)', () => {
        expect(getPincodeZoneHint('682555')).toBe('remote');
    });
    test('226001 → standard (Lucknow)', () => {
        expect(getPincodeZoneHint('226001')).toBe('standard');
    });
    test('invalid string → standard', () => {
        expect(getPincodeZoneHint('abc')).toBe('standard');
    });
    test('undefined → standard', () => {
        expect(getPincodeZoneHint(undefined)).toBe('standard');
    });
});

// ---------------------------------------------------------------------------
// getShippingZone — new signature:
// (customerCity, customerState, customerPincode, originCity, originState, originPincode)
// ---------------------------------------------------------------------------

describe('getShippingZone', () => {
    test('same pincode → A', () => {
        expect(getShippingZone('Mumbai', 'Maharashtra', '400001', 'Mumbai', 'Maharashtra', '400001')).toBe('A');
    });

    test('same city, different pincode → A', () => {
        expect(getShippingZone('Mumbai', 'Maharashtra', '400050', 'Mumbai', 'Maharashtra', '400001')).toBe('A');
    });

    test('same city case-insensitive → A', () => {
        expect(getShippingZone('MUMBAI', 'Maharashtra', '400050', 'Mumbai', 'Maharashtra', '400001')).toBe('A');
    });

    test('same state, different city → B', () => {
        // Pune (metro) + Mumbai (metro) same state → B, state check wins over metro check
        expect(getShippingZone('Pune', 'Maharashtra', '411001', 'Mumbai', 'Maharashtra', '400001')).toBe('B');
    });

    test('metro + metro, same state → B (state check wins before metro check)', () => {
        expect(getShippingZone('Pune', 'Maharashtra', '411020', 'Mumbai', 'Maharashtra', '400010')).toBe('B');
    });

    test('Delhi pincode + Mumbai pincode (both metro, different state) → C', () => {
        expect(getShippingZone('Delhi', 'Delhi', '110005', 'Mumbai', 'Maharashtra', '400001')).toBe('C');
    });

    test('Lucknow + Jaipur (both standard, different state) → D', () => {
        expect(getShippingZone('Lucknow', 'Uttar Pradesh', '226001', 'Jaipur', 'Rajasthan', '302001')).toBe('D');
    });

    test('Assam pincode involved → E', () => {
        expect(getShippingZone('Guwahati', 'Assam', '781001', 'Mumbai', 'Maharashtra', '400001')).toBe('E');
    });

    test('northeast origin → E', () => {
        expect(getShippingZone('Mumbai', 'Maharashtra', '400001', 'Imphal', 'Manipur', '795001')).toBe('E');
    });

    test('J&K pincode involved → F', () => {
        expect(getShippingZone('Srinagar', 'J&K', '180001', 'Mumbai', 'Maharashtra', '400001')).toBe('F');
    });

    test('remote takes priority over northeast — origin J&K, dest Assam → F', () => {
        expect(getShippingZone('Guwahati', 'Assam', '781001', 'Srinagar', 'J&K', '180001')).toBe('F');
    });

    test('Andaman destination → F', () => {
        expect(getShippingZone('Port Blair', 'Andaman', '744102', 'Mumbai', 'Maharashtra', '400001')).toBe('F');
    });

    test('empty customer city and state → D', () => {
        expect(getShippingZone('', '', '', 'Mumbai', 'Maharashtra', '400001')).toBe('D');
    });

    test('missing customer city and state → D', () => {
        expect(getShippingZone(undefined, undefined, undefined, 'Mumbai', 'Maharashtra', '400001')).toBe('D');
    });

    test('null origin city does not throw and returns D', () => {
        expect(() => getShippingZone('Chennai', 'Tamil Nadu', '600001', null, null, null)).not.toThrow();
        expect(getShippingZone('Chennai', 'Tamil Nadu', '600001', null, null, null)).toBe('D');
    });
});

// ---------------------------------------------------------------------------
// calculateQuantityPrice — zone-specific courier charges (A–F)
// ---------------------------------------------------------------------------

describe('calculateQuantityPrice — zone courier charges', () => {
    const tiers = [{
        min_qty: 1,
        max_qty: null,
        price_per_item: 100,
        courier_charge_a: 20,
        courier_charge_b: 50,
        courier_charge_c: 65,
        courier_charge_d: 80,
        courier_charge_e: 120,
        courier_charge_f: 150,
        courier_charge: 80,
    }];

    test('zone A reads courier_charge_a', () => {
        expect(calculateQuantityPrice(100, 1, tiers, 'A').courierCharge).toBe(20);
    });
    test('zone B reads courier_charge_b', () => {
        expect(calculateQuantityPrice(100, 1, tiers, 'B').courierCharge).toBe(50);
    });
    test('zone C reads courier_charge_c', () => {
        expect(calculateQuantityPrice(100, 1, tiers, 'C').courierCharge).toBe(65);
    });
    test('zone D reads courier_charge_d', () => {
        expect(calculateQuantityPrice(100, 1, tiers, 'D').courierCharge).toBe(80);
    });
    test('zone E reads courier_charge_e', () => {
        expect(calculateQuantityPrice(100, 1, tiers, 'E').courierCharge).toBe(120);
    });
    test('zone F reads courier_charge_f', () => {
        expect(calculateQuantityPrice(100, 1, tiers, 'F').courierCharge).toBe(150);
    });

    test('zone C falls back to courier_charge when courier_charge_c is null', () => {
        const tiersNoC = [{ min_qty: 1, max_qty: null, price_per_item: 100, courier_charge_c: null, courier_charge: 80 }];
        expect(calculateQuantityPrice(100, 1, tiersNoC, 'C').courierCharge).toBe(80);
    });

    test('falls back to courier_charge when zone-specific field is absent', () => {
        const tiersNoZone = [{ min_qty: 1, max_qty: null, price_per_item: 100, courier_charge: 60 }];
        expect(calculateQuantityPrice(100, 1, tiersNoZone, 'A').courierCharge).toBe(60);
    });

    test('defaults to 0 when no courier_charge fields exist', () => {
        const tiersNone = [{ min_qty: 1, max_qty: null, price_per_item: 100 }];
        expect(calculateQuantityPrice(100, 1, tiersNone, 'D').courierCharge).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// buildOrderPricingQuote — digital products must not accumulate courier charge
// ---------------------------------------------------------------------------

describe('buildOrderPricingQuote — digital products', () => {
    test('digital product courier_charge is 0 regardless of tier config', () => {
        const product = {
            id: 'digital-1',
            name: 'eBook',
            price: 50,
            product_type: 'digital',
            weight: 0,
            volumetric_weight: 0,
            extra_shipping_charge: 0,
            origin_city: 'Mumbai',
            origin_state: 'Maharashtra',
            origin_pincode: '400001',
            cover_image: null,
            slug: 'ebook',
            tiered_pricing: [{
                min_qty: 1,
                max_qty: null,
                price_per_item: 50,
                courier_charge: 99,
                courier_charge_a: 10,
                courier_charge_d: 99,
            }],
        };

        const quote = buildOrderPricingQuote(
            [{ product_id: 'digital-1', quantity: 1 }],
            { city: 'Delhi', state: 'Delhi', pincode: '110001' },
            new Map([['digital-1', product]]),
            {}
        );

        expect(quote.shipping_cost).toBe(0);
        expect(quote.items[0].courier_charge).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// getOrderQuote — physical product requires city, state, and 6-digit pincode
// ---------------------------------------------------------------------------

describe('getOrderQuote — location validation', () => {
    const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440001';

    const physicalProduct = {
        id: PRODUCT_ID,
        name: 'Widget',
        price: 100,
        product_type: 'physical',
        stock_quantity: 10,
        is_active: true,
        tiered_pricing: [],
        requires_kyc: false,
        requires_kyc_multiple: false,
        weight: 500,
        volumetric_weight: 0,
        extra_shipping_charge: 0,
        origin_city: 'Ernakulam',
        origin_state: 'Kerala',
        origin_pincode: '682001',
        cover_image: null,
        slug: 'widget',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        getClient.mockResolvedValue({
            query: jest.fn().mockResolvedValue({ rows: [physicalProduct] }),
            release: jest.fn(),
        });
    });

    function makeReq(customer) {
        return { body: { items: [{ product_id: PRODUCT_ID, quantity: 1 }], customer } };
    }

    function makeRes() {
        const res = { status: jest.fn(), json: jest.fn() };
        res.status.mockReturnValue(res);
        return res;
    }

    test('missing city and state → 400', async () => {
        const res = makeRes();
        await getOrderQuote(makeReq({ city: '', state: '', pincode: '682001' }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            message: expect.stringContaining('City, state, and pincode are required'),
        }));
    });

    test('missing city only → 400', async () => {
        const res = makeRes();
        await getOrderQuote(makeReq({ city: '', state: 'Kerala', pincode: '682001' }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('missing state only → 400', async () => {
        const res = makeRes();
        await getOrderQuote(makeReq({ city: 'Ernakulam', state: '', pincode: '682001' }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('no customer object at all → 400', async () => {
        const res = makeRes();
        await getOrderQuote(makeReq(undefined), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('invalid pincode (3 digits) → 400', async () => {
        const res = makeRes();
        await getOrderQuote(makeReq({ city: 'Ernakulam', state: 'Kerala', pincode: '123' }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('invalid pincode (7 digits) → 400', async () => {
        const res = makeRes();
        await getOrderQuote(makeReq({ city: 'Ernakulam', state: 'Kerala', pincode: '1234567' }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('invalid pincode (non-numeric) → 400', async () => {
        const res = makeRes();
        await getOrderQuote(makeReq({ city: 'Ernakulam', state: 'Kerala', pincode: 'ABCDEF' }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('missing pincode entirely → 400', async () => {
        const res = makeRes();
        await getOrderQuote(makeReq({ city: 'Ernakulam', state: 'Kerala' }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });
});
