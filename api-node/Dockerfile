FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl openssl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src

# Build TypeScript (optional for dev, required for prod)
# RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "dev"]
