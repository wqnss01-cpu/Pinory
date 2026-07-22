ALTER TABLE places
  ADD COLUMN IF NOT EXISTS geography_checked_at timestamptz;

UPDATE places SET
  country_code=NULLIF(upper(trim(country_code)),''),
  country_name=NULLIF(trim(country_name),''),
  region=NULLIF(trim(region),''),
  city=NULLIF(trim(city),'');

UPDATE places SET geography_checked_at=COALESCE(geography_checked_at,now())
WHERE country_code IS NOT NULL AND country_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS places_geography_refresh_idx
  ON places(geography_checked_at,country_code) WHERE geography_checked_at IS NULL OR country_code IS NULL;

CREATE INDEX IF NOT EXISTS places_country_city_idx
  ON places(country_code,region,city);
