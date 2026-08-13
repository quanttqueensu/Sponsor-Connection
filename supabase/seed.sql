insert into public.companies (name, slug, is_sponsor, website, description, status)
values
  ('Ontario Teachers'' Pension Plan', 'otpp', true, null, 'One of the world''s largest institutional investors, managing $250B+ in assets.', 'active'),
  ('Picton Investments', 'picton', true, null, 'Canadian investment management firm focused on quantitative strategies.', 'active'),
  ('National Bank of Canada', 'nbc', true, null, 'Leading Canadian financial institution with a strong quantitative division.', 'active'),
  ('Connor, Clark & Lunn', 'ccl', true, null, 'Multi-boutique asset management firm specializing in quantitative investing.', 'active'),
  ('QuantConnect', 'quantconnect', true, 'https://www.quantconnect.com', 'Open-source algorithmic trading platform.', 'active'),
  ('Viewpoint Investment Partners', 'viewpoint', false, null, 'Investment advisory firm focused on alternative strategies.', 'inactive')
on conflict (slug) do nothing;
