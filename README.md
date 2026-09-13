# MSA Reservation System

Redis Distributed Lock을 활용한 **동시성 제어 기반 예약 시스템**입니다.

예약 요청이 동시에 발생하는 상황에서 Redis 기반 분산 락을 적용하여 중복 예약을 방지하고, 서비스별 데이터베이스를 분리한 MSA 구조를 통해 서비스 간 결합도를 낮추는 것을 목표로 합니다.

---

## 1. System Architecture

```text
                         Client
                           │
                           ▼
                    ┌─────────────┐
                    │   Gateway   │
                    │   (예정)    │
                    └──────┬──────┘
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
      ┌──────────┐  ┌──────────────┐  ┌────────────────┐
      │   Auth   │  │   Resource   │  │  Reservation   │
      │ Service  │  │   Service    │  │    Service     │
      └────┬─────┘  └──────┬───────┘  └───────┬────────┘
           │               │                  │
           ▼               ▼                  ▼
      PostgreSQL      PostgreSQL         PostgreSQL
                                             │
                                             ▼
                                           Redis
                                      Distributed Lock
```

### Services

| Service               | Port | Description                          | Database / Cache   |
| --------------------- | ---: | ------------------------------------ | ------------------ |
| `auth-service`        | 3001 | 회원가입, 로그인, JWT 인증           | PostgreSQL         |
| `resource-service`    | 3002 | 예약 가능 자원 등록 및 조회          | PostgreSQL         |
| `reservation-service` | 3003 | 예약 생성, 조회, 취소 및 동시성 제어 | PostgreSQL + Redis |
| `gateway`             |  TBD | API Routing 및 Authentication Filter | -                  |

각 서비스는 자신의 데이터에 대한 소유권을 가지며, 서비스 간 데이터베이스 직접 접근을 제한하는 **Service-oriented Database** 구조를 지향합니다.

---

## 2. Tech Stack

### Runtime & Language

- Node.js
- Express
- TypeScript

### Database & ORM

- PostgreSQL
- Prisma ORM `v6.19.3`

### Cache & Concurrency Control

- Redis
- ioredis
- Redis Distributed Lock

### Infrastructure

- Docker
- Docker Compose

### Testing

- k6 / Artillery _(예정)_

---

## 3. Core Features

### 3.1 MSA 기반 서비스 분리

기능별로 서비스를 분리하여 각 서비스의 책임과 데이터 소유권을 명확하게 구성합니다.

```text
Auth Service
 └─ User / Authentication

Resource Service
 └─ Reservable Resource

Reservation Service
 └─ Reservation / Concurrency Control
```

서비스별 독립적인 데이터베이스를 사용하여 서비스 간 결합도를 낮추고, 향후 개별 서비스의 독립적인 확장과 배포를 고려한 구조입니다.

---

### 3.2 Redis Distributed Lock

예약 요청이 동시에 발생할 경우 동일한 자원에 대한 중복 예약이 발생할 수 있습니다.

이를 방지하기 위해 예약 생성 과정에서 Redis 기반 분산 락을 먼저 획득합니다.

```text
Client
  │
  ▼
Reservation Service
  │
  ├──> Redis: Acquire Distributed Lock
  │        │
  │        ├── Fail
  │        │     └──> 409 Conflict / Retry
  │        │
  │        └── Success
  │               │
  │               ▼
  │        PostgreSQL
  │        Check Availability
  │               │
  │               ▼
  │        Create Reservation
  │               │
  │               ▼
  └──────── Redis: Release Lock
```

Redis Lock을 통해 예약 처리 구간의 동시 접근을 제어하고, 데이터베이스에서 발생할 수 있는 불필요한 락 경합을 줄이는 것을 목표로 합니다.

단, Redis Lock만으로 데이터 정합성을 보장하는 것이 아니라 **PostgreSQL Transaction 및 제약 조건을 함께 활용하여 최종적인 정합성을 보장**하는 방향으로 설계합니다.

---

### 3.3 Database Isolation

각 서비스는 자신의 데이터베이스 및 도메인을 독립적으로 관리합니다.

```text
auth-service
    └── PostgreSQL
         └── User

resource-service
    └── PostgreSQL
         └── Resource

reservation-service
    └── PostgreSQL
         └── Reservation
```

이를 통해 특정 서비스의 데이터 구조 변경이 다른 서비스에 직접적인 영향을 주지 않도록 구성합니다.

---

## 4. Reservation Flow

예약 생성 요청의 기본 처리 흐름은 다음과 같습니다.

```text
1. Client
   │
   ▼
2. Reservation Service
   │
   ▼
3. Acquire Redis Distributed Lock
   │
   ├── Lock 획득 실패
   │      └── 409 Conflict / Retry
   │
   └── Lock 획득 성공
          │
          ▼
4. PostgreSQL Transaction
   │
   ├── 예약 가능 여부 확인
   │
   └── 예약 생성
          │
          ▼
5. Commit
   │
   ▼
6. Release Redis Lock
   │
   ▼
7. Response
```

---

## 5. Getting Started

### Prerequisites

- Docker
- Docker Desktop
- Node.js `v18+`
- npm

---

### 5.1 Repository Clone & Infrastructure Setup

```bash
git clone <repository-url>
cd msa_redis/infrastructure

# PostgreSQL & Redis Container 실행
docker compose up -d
```

---

### 5.2 Environment Variables

`services/reservation-service` 디렉터리에 `.env` 파일을 생성합니다.

```bash
cd ../services/reservation-service
cp .env.example .env
```

`.env`

```env
PORT=3003

DATABASE_URL="postgresql://reserve:reserve123@localhost:5432/reserve?schema=public"

REDIS_HOST="localhost"
REDIS_PORT=6379
```

> 실제 배포 환경에서는 데이터베이스 계정 및 Redis 설정을 환경 변수 또는 Secret 관리 시스템을 통해 관리합니다.

---

### 5.3 Install Dependencies & Database Migration

```bash
# 의존성 설치
npm install

# Prisma Schema 검증
npx prisma validate

# Database Migration
npx prisma migrate dev --name init
```

---

### 5.4 Run Application

```bash
npm run dev
```

Reservation Service는 기본적으로 `3003` 포트에서 실행됩니다.

---

## 6. Directory Structure

`services/reservation-service` 기준 구조입니다.

```text
reservation-service/
├── prisma/
│   └── schema.prisma
│
├── src/
│   ├── config/
│   │   └── redis.ts
│   │
│   ├── controllers/
│   │   └── reservation.controller.ts
│   │
│   ├── services/
│   │   └── reservation.service.ts
│   │
│   ├── routes/
│   │   └── reservation.routes.ts
│   │
│   └── app.ts
│
├── .env.example
├── package.json
└── tsconfig.json
```

### 주요 디렉터리

| Directory      | Responsibility                    |
| -------------- | --------------------------------- |
| `config/`      | Redis 및 Database Connection 설정 |
| `controllers/` | HTTP Request / Response 처리      |
| `services/`    | 예약 비즈니스 로직 및 동시성 제어 |
| `routes/`      | API Endpoint 및 Router 구성       |
| `prisma/`      | Prisma Schema 및 Migration        |

---

## 7. Roadmap

### Infrastructure

- [x] MSA 프로젝트 멀티 디렉터리 구조 구성
- [x] Docker Compose 구성
- [x] PostgreSQL / Redis Container 구성
- [x] TypeScript 환경 구성
- [x] Prisma `v6.19.3` 환경 구성
- [x] ioredis 환경 구성

### Reservation Service

- [ ] PostgreSQL 연동
- [ ] Reservation Domain Schema 설계
- [ ] Reservation CRUD 구현
- [ ] Redis Distributed Lock 구현
- [ ] Lock TTL 및 예외 상황 처리
- [ ] Transaction 기반 데이터 정합성 확보

### Concurrency Test

- [ ] k6 / Artillery 부하 테스트 구성
- [ ] 동시 예약 요청 테스트
- [ ] 중복 예약 발생 여부 검증
- [ ] Redis Lock 적용 전/후 성능 비교
- [ ] Lock 경합 및 응답 시간 측정

### MSA

- [ ] `auth-service` 개발
- [ ] `resource-service` 개발
- [ ] API Gateway 구축
- [ ] Service 간 통신 구조 설계
- [ ] Authentication / Authorization 처리

### Advanced

- [ ] Reservation State Machine 도입
- [ ] Redis TTL 기반 예약 만료 처리
- [ ] Message Queue 기반 비동기 만료 처리
- [ ] 장애 상황 및 Lock Recovery 전략 구현

### Deployment

- [ ] AWS EC2 배포
- [ ] AWS RDS 구성
- [ ] AWS ElastiCache Redis 구성
- [ ] CI/CD Pipeline 구축
- [ ] 운영 환경 모니터링 구성

---

## 8. Design Decisions

프로젝트의 주요 아키텍처 및 기술 선택에 대한 상세한 내용은 `why.md`에서 확인할 수 있습니다.

주요 설계 주제:

- MSA 구조를 선택한 이유
- 서비스별 Database Isolation을 적용한 이유
- Redis Distributed Lock을 선택한 이유
- Redis Lock과 Database Transaction을 함께 사용하는 이유
- Lock TTL 및 장애 상황에 대한 처리 전략
- 동시성 테스트 및 성능 측정 방법
- Reservation State Machine 도입 배경
- Message Queue 기반 비동기 처리 구조

---

## 9. Project Goals

이 프로젝트는 단순한 예약 CRUD 구현을 넘어 다음과 같은 백엔드 설계 및 운영 경험을 확보하는 것을 목표로 합니다.

- **MSA Architecture**
- **Distributed Lock**
- **Concurrency Control**
- **Database Transaction**
- **Data Consistency**
- **Redis**
- **Load Testing**
- **Docker-based Infrastructure**
- **AWS Deployment**
- **CI/CD**

특히 동일한 자원에 대한 동시 예약 요청을 안정적으로 처리하고, **Redis Lock + Database Transaction을 조합한 동시성 제어 구조를 직접 구현하고 검증하는 것**을 핵심 과제로 합니다.
