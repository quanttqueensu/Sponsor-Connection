insert into public.companies (
  name, slug, website, description, status, sponsor_tier_id, grace_tier_id, tier_grace_until
)
select v.name, v.slug, v.website, v.description, v.status, t.id, g.id, current_date + 60
from (values
  ('Ontario Teachers'' Pension Plan', 'otpp', null::text, 'One of the world''s largest institutional investors, managing $250B+ in assets.', 'active', 'partner'),
  ('Picton Investments', 'picton', null, 'Canadian investment management firm focused on quantitative strategies.', 'active', 'partner'),
  ('National Bank of Canada', 'nbc', null, 'Leading Canadian financial institution with a strong quantitative division.', 'active', 'partner'),
  ('Connor, Clark & Lunn', 'ccl', null, 'Multi-boutique asset management firm specializing in quantitative investing.', 'active', 'partner'),
  ('QuantConnect', 'quantconnect', 'https://www.quantconnect.com', 'Open-source algorithmic trading platform.', 'active', 'partner'),
  ('Viewpoint Investment Partners', 'viewpoint', null, 'Investment advisory firm focused on alternative strategies.', 'inactive', 'none')
) as v(name, slug, website, description, status, tier_key)
join public.sponsor_tiers t on t.key = v.tier_key
join public.sponsor_tiers g on g.key = 'grandfathered'
on conflict (slug) do nothing;
