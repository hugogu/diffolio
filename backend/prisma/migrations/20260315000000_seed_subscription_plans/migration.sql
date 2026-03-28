-- Seed default subscription plans
-- ON CONFLICT DO NOTHING makes this idempotent: safe to run on existing deployments

INSERT INTO "subscription_plans" ("id", "tier", "monthly_energy_alloc", "slot_count", "price_yuan", "description", "is_active", "updated_at")
VALUES
  ('a1b2c3d4-0001-0000-0000-000000000001', 'BASIC',    2000,  1, 9.00,  '轻量赞助：适合个人日常学习，每月 2000 词对比额度，1 个书籍栏位。', true, NOW()),
  ('a1b2c3d4-0001-0000-0000-000000000002', 'ADVANCED',  4000,  2, 17.00, '友情赞助：适合进阶研习，每月 4000 词对比额度，2 个书籍栏位，专属讨论群。', true, NOW()),
  ('a1b2c3d4-0001-0000-0000-000000000003', 'PREMIUM',   6000,  3, 24.00, '深度赞助：适合系统研究，每月 6000 词对比额度，3 个书籍栏位，专属讨论群。', true, NOW()),
  ('a1b2c3d4-0001-0000-0000-000000000004', 'ELITE',    10000,  5, 38.00, '铁杆赞助：全功能支持，每月 10000 词对比额度，5 个书籍栏位，专属讨论群。', true, NOW())
ON CONFLICT ("tier") DO NOTHING;
