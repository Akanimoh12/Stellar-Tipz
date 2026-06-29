.PHONY: dev test coverage lint typecheck db-up db-down migrate seed

dev:
	npm run dev

test:
	npm run test

coverage:
	npm run test:coverage

lint:
	npm run lint

typecheck:
	npm run typecheck

db-up:
	docker compose -f docker-compose.yml up -d

db-down:
	docker compose -f docker-compose.yml down

migrate:
	npm run prisma:migrate

seed:
	npm run db:seed
