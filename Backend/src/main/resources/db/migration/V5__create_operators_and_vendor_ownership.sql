-- Operator accounts own food trucks. The foreign key starts nullable so existing
-- vendors remain valid until real accounts are created and assigned.
CREATE TABLE operators (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    display_name VARCHAR(120) NOT NULL,
    email VARCHAR(320) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT operators_display_name_not_blank CHECK (length(trim(display_name)) > 0),
    CONSTRAINT operators_email_not_blank CHECK (length(trim(email)) > 0),
    CONSTRAINT operators_password_hash_not_blank CHECK (length(trim(password_hash)) > 0)
);

CREATE UNIQUE INDEX operators_email_case_insensitive_unique
    ON operators (lower(email));

ALTER TABLE vendors
    ADD COLUMN operator_id BIGINT,
    ADD CONSTRAINT vendors_operator_id_fk
        FOREIGN KEY (operator_id) REFERENCES operators (id);

CREATE INDEX vendors_operator_id_idx ON vendors (operator_id);
