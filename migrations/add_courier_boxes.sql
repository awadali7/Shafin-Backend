-- Courier Boxes: reusable shipping rate cards with per-zone pricing
CREATE TABLE IF NOT EXISTS courier_boxes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    charge_a    NUMERIC(10,2) NOT NULL DEFAULT 0,
    charge_b    NUMERIC(10,2) NOT NULL DEFAULT 0,
    charge_c    NUMERIC(10,2) NOT NULL DEFAULT 0,
    charge_d    NUMERIC(10,2) NOT NULL DEFAULT 0,
    charge_e    NUMERIC(10,2) NOT NULL DEFAULT 0,
    charge_f    NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
