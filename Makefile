run:
	npm run dev


run-prod:
	PORT=3000 npm run build && PORT=3000 npm run start
