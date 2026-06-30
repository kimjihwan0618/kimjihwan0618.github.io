---
layout: single
title: "[Python] Celery vs Taskiq 비동기 작업 큐 비교"
categories: "programming"
tags: ["python", "fastapi"]
typora-root-url: ../
description: Python 분산 작업 큐 Celery와 Taskiq의 구조, 동시성 모델, 재시도, 스케줄링, 운영 관점 비교
excerpt: "Python 분산 작업 큐 Celery와 Taskiq의 구조, 동시성 모델, 재시도, 스케줄링, 운영 관점 비교"
toc: true
toc_sticky: true
header:
  teaser: ../../assets/images/thumbnail/celery-taskiq.jpg
---

![Celery와 Taskiq 비교](/assets/images/thumbnail/celery-taskiq.jpg)

API에서 이메일 전송, 이미지 변환, 리포트 생성처럼 오래 걸리는 작업을 직접 처리하면 응답 시간이 길어지고 장애가 전파되기 쉽습니다. 이런 작업을 메시지 브로커에 전달하고 별도의 Worker가 처리하게 만드는 것이 `Task Queue`입니다.

Python에서는 `Celery`가 가장 널리 알려져 있지만, FastAPI와 asyncio 기반 프로젝트에서는 `Taskiq`도 선택지로 자주 언급됩니다. 이번 글에서는 두 프레임워크의 사용법보다 "어떤 상황에서 무엇을 선택할 것인가"를 중심으로 정리해 보겠습니다.

> 이 글은 2026년 6월 기준 Celery 5.6 계열과 Taskiq 0.12 계열의 공식 문서를 참고했습니다.
> {: .notice--info}

### 1️⃣ Task Queue의 기본 구조

두 프레임워크의 큰 구조는 동일합니다.

`Producer`는 실행할 작업을 메시지로 만들고, `Broker`는 메시지를 보관하거나 전달합니다. 별도의 `Worker`가 메시지를 가져와 실제 함수를 실행하며, 결과가 필요하면 `Result Backend`에 저장합니다.

```plaintext
API / Producer
    ↓ 작업 메시지
Message Broker (Redis, RabbitMQ 등)
    ↓
Worker
    ↓ 실행 결과
Result Backend
```

중요한 점은 Celery나 Taskiq 자체가 메시지를 영구 저장하는 서버는 아니라는 것입니다. 실제 전달 신뢰성은 어떤 Broker를 선택하고 ACK, 재시도, Prefetch를 어떻게 설정하는지에 따라 달라집니다.

### 2️⃣ Celery란?

Celery는 실시간 작업 처리와 예약 작업을 지원하는 Python 분산 작업 큐입니다. 기본 Worker 모델은 여러 자식 프로세스를 사용하는 `prefork`이며, threads, eventlet, gevent 등의 실행 Pool도 제공합니다.

Celery의 장점은 오랜 기간 쌓인 운영 기능입니다.

- Redis와 RabbitMQ를 포함한 다양한 Broker 지원
- 작업 재시도, Rate Limit, Soft/Hard Time Limit
- Queue Routing과 Worker Remote Control
- `chain`, `group`, `chord` 등의 Canvas Workflow
- Celery Beat를 이용한 주기 실행
- Worker Event, Inspect, Flower 등을 이용한 모니터링
- Django를 포함한 큰 생태계와 많은 운영 사례

Celery는 강력하지만 기본 실행 모델과 설정 항목이 많습니다. Worker Pool, ACK 시점, Prefetch, Result Backend 만료 등을 이해하지 않고 기본값만 사용하면 긴 작업이 특정 Worker에 몰리거나 중복 실행에 당황할 수 있습니다.

### 3️⃣ Taskiq란?

Taskiq는 asyncio를 중심으로 설계된 분산 작업 큐입니다. `async def` 작업을 자연스럽게 실행할 수 있고 동기 함수도 ThreadPool 또는 ProcessPool을 통해 처리합니다.

Taskiq의 주요 특징은 다음과 같습니다.

- 동기 함수와 비동기 함수를 모두 Task로 등록
- `await task.kiq(...)` 형태의 비동기 호출
- 타입 힌트와 PEP 612 기반 자동완성
- FastAPI 스타일의 의존성 주입
- FastAPI, AioHTTP 같은 비동기 프레임워크 연동
- Middleware 기반 Retry, Prometheus, OpenTelemetry 구성
- Broker와 Result Backend를 별도 플러그인으로 선택
- Taskiq Scheduler와 Schedule Source를 이용한 예약 실행

Taskiq Core에는 InMemoryBroker와 ZeroMQBroker 등이 포함되며, Redis, RabbitMQ, NATS 같은 운영용 Broker는 별도 패키지로 설치합니다. Result Backend도 기본값은 결과를 저장하지 않는 Dummy Backend이므로 결과가 필요하다면 Redis나 NATS Backend 등을 명시해야 합니다.

### 4️⃣ 핵심 차이 비교

| 비교 항목 | Celery | Taskiq |
|---|---|---|
| 설계 성격 | 운영 기능이 풍부한 범용 분산 작업 큐 | asyncio 중심의 타입 친화적 작업 큐 |
| 기본 동시성 | prefork 기반 멀티프로세스 | async task + Worker 프로세스 |
| 비동기 함수 | asyncio-first API는 아님 | `async def` 직접 지원 |
| 동기 함수 | 기본 사용 방식 | ThreadPool 기본, ProcessPool 선택 |
| 작업 호출 | `.delay()`, `.apply_async()` | `await .kiq()` |
| Broker | Redis/RabbitMQ 등이 Celery Transport로 통합 | Broker별 플러그인 설치 |
| Result Backend | Redis, DB, Cache 등 다양한 구현 | Core 기본은 Dummy, 별도 플러그인 권장 |
| 재시도 | Task 자체 Retry와 autoretry 제공 | Simple/Smart Retry Middleware |
| Workflow | Canvas 기능이 성숙함 | Plugin 또는 애플리케이션 조합 중심 |
| 스케줄링 | Celery Beat | Taskiq Scheduler + Schedule Source |
| FastAPI 연동 | 사용 가능하지만 별도 패턴 필요 | `taskiq-fastapi` 공식 연동 |
| 모니터링 | Events, Inspect, Flower 생태계 | Prometheus/OpenTelemetry Middleware |
| 운영 사례 | 매우 많음 | 상대적으로 새로운 생태계 |
| 적합한 프로젝트 | Django, 복잡한 Workflow, 보수적 운영 | FastAPI, asyncio, 비동기 I/O 중심 |

### 5️⃣ Celery + Redis 예제

먼저 패키지를 설치합니다.

```bash
pip install "celery[redis]"
```

`tasks.py`를 작성합니다.

```python
from celery import Celery

app = Celery(
    "tasks",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/1",
)

app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    result_expires=3600,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)


@app.task(
    autoretry_for=(ConnectionError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
)
def send_report(report_id: int) -> dict:
    # 오래 걸리는 리포트 생성 로직
    return {"report_id": report_id, "status": "completed"}
```

작업을 전달할 때는 다음과 같이 호출합니다.

```python
from tasks import send_report

result = send_report.delay(100)
print(result.id)
```

Worker는 별도 프로세스로 실행합니다.

```bash
celery -A tasks worker --loglevel=INFO --concurrency=4
```

`task_acks_late=True`는 작업 실행 후 ACK를 전송하도록 합니다. Worker가 작업 도중 종료됐을 때 Broker가 메시지를 다시 전달할 수 있지만, 그만큼 작업이 중복 실행될 가능성도 있으므로 Task는 멱등성 있게 작성해야 합니다.

`worker_prefetch_multiplier=1`은 Worker 프로세스가 미리 가져오는 작업 수를 줄입니다. 실행 시간이 긴 작업이 섞여 있을 때 특정 Worker에 작업이 몰리는 현상을 완화하는 데 유용합니다.

### 6️⃣ Taskiq + Redis 예제

Taskiq Core와 Redis Broker 플러그인을 설치합니다.

```bash
pip install taskiq taskiq-redis
```

Taskiq Redis Plugin에는 여러 Broker 구현이 있습니다. 작업 유실 방지를 위해 ACK가 필요하다면 Redis Pub/Sub나 List Queue보다 `RedisStreamBroker`가 적합합니다.

```python
from taskiq import SmartRetryMiddleware
from taskiq_redis import RedisAsyncResultBackend, RedisStreamBroker

result_backend = RedisAsyncResultBackend(
    redis_url="redis://localhost:6379/1",
    result_ex_time=3600,
)

broker = (
    RedisStreamBroker(url="redis://localhost:6379/0")
    .with_result_backend(result_backend)
    .with_middlewares(
        SmartRetryMiddleware(
            default_retry_count=5,
            default_delay=3,
            use_jitter=True,
            use_delay_exponent=True,
            max_delay_exponent=120,
        ),
    )
)


@broker.task(
    retry_on_error=True,
    max_retries=5,
    delay=3,
)
async def send_report(report_id: int) -> dict:
    # async DB, HTTP Client 등을 자연스럽게 await
    return {"report_id": report_id, "status": "completed"}
```

비동기 애플리케이션에서는 다음과 같이 작업을 전달합니다.

```python
task = await send_report.kiq(100)
result = await task.wait_result(timeout=30)

print(result.return_value)
```

Worker 실행 명령은 다음과 같습니다.

```bash
taskiq worker tasks:broker --workers 4 --max-async-tasks 100
```

`--max-async-tasks`는 Worker당 동시에 실행할 비동기 작업 수를 제한합니다. 외부 API나 DB 호출이 많은 I/O 작업에서는 높은 동시성을 사용할 수 있지만, DB Connection Pool과 외부 시스템 허용량을 함께 고려해야 합니다.

### 7️⃣ 동시성 모델 차이

#### Celery

Celery 기본 Pool은 `prefork`입니다. 각 자식 프로세스가 작업을 실행하므로 CPU 작업의 격리와 안정성 측면에서 이해하기 쉽습니다.

반면 작업 대부분이 HTTP, DB, 파일 I/O 대기라면 많은 프로세스가 메모리를 소비할 수 있습니다. 이 경우 threads, eventlet, gevent Pool을 검토할 수 있지만 Pool에 따라 Soft Timeout 같은 일부 기능의 동작 차이도 확인해야 합니다.

#### Taskiq

Taskiq는 비동기 함수를 Event Loop에서 실행합니다. I/O 대기 중 다른 Task를 처리할 수 있어 FastAPI와 같은 async 기반 애플리케이션과 잘 맞습니다.

동기 함수는 기본적으로 ThreadPool에서 실행합니다. 이미지 처리, 머신러닝처럼 CPU 사용량이 높은 동기 함수라면 `--use-process-pool` 옵션으로 ProcessPool을 선택하는 편이 적절합니다.

> asyncio를 사용한다고 CPU 작업 자체가 빨라지는 것은 아닙니다. async의 장점은 네트워크나 DB 응답을 기다리는 동안 다른 작업을 처리할 수 있다는 점입니다.
> {: .notice--warning}

### 8️⃣ 재시도 방식

Celery는 Task 내부에서 `self.retry()`를 호출하거나 `autoretry_for`를 설정할 수 있습니다. Backoff, Jitter, 최대 재시도 횟수를 Task 단위로 지정할 수 있습니다.

Taskiq는 Middleware가 작업 실패를 감지해 다시 전달합니다.

- `SimpleRetryMiddleware`: 단순 횟수 기반 재시도
- `SmartRetryMiddleware`: Delay, Jitter, Exponential Backoff 지원

두 프레임워크 모두 무조건 재시도하면 안 됩니다. 입력 데이터 오류처럼 다시 실행해도 성공할 수 없는 예외와 네트워크 타임아웃처럼 일시적인 예외를 구분해야 합니다.

### 9️⃣ 예약 작업

Celery는 `Celery Beat`가 예약 작업을 Broker로 전달합니다.

```bash
celery -A tasks beat --loglevel=INFO
```

Taskiq는 `TaskiqScheduler`와 `ScheduleSource`를 사용합니다.

```python
from taskiq import TaskiqScheduler
from taskiq.schedule_sources import LabelScheduleSource

scheduler = TaskiqScheduler(
    broker=broker,
    sources=[LabelScheduleSource(broker)],
)


@broker.task(
    schedule=[
        {
            "cron": "0 2 * * *",
            "args": [100],
        },
    ],
)
async def create_daily_report(report_id: int) -> None:
    ...
```

```bash
taskiq scheduler tasks:scheduler
```

Scheduler가 여러 개 실행되면 같은 예약 작업이 중복 전달될 수 있습니다. 별도 분산 잠금이 없다면 Celery Beat와 Taskiq Scheduler 모두 하나의 Active Instance만 운영하는 것이 안전합니다.

### 🔟 성능은 프레임워크 이름만으로 결정되지 않는다

Taskiq가 asyncio 기반이라고 해서 모든 작업에서 Celery보다 빠른 것은 아닙니다. 실제 처리량에 더 큰 영향을 주는 요소는 다음과 같습니다.

- 작업이 CPU Bound인지 I/O Bound인지
- Worker 프로세스 및 동시 실행 수
- Broker 종류와 메시지 ACK 방식
- 메시지 크기와 직렬화 비용
- DB Connection Pool 크기
- 외부 API의 Rate Limit
- 작업 실행 시간의 편차
- Prefetch 설정

따라서 동일한 작업, Broker, 메시지 크기, 실패율을 기준으로 부하 테스트한 뒤 선택하는 것이 가장 정확합니다.

### 1️⃣1️⃣ 어떤 것을 선택할까?

#### Celery가 적합한 경우

- Django 기반 프로젝트
- 팀에 Celery 운영 경험이 있는 경우
- chain, group, chord 등 복잡한 Workflow가 필요한 경우
- Worker Remote Control과 성숙한 모니터링 도구가 필요한 경우
- 장기간 검증된 생태계를 우선하는 경우
- CPU 작업과 I/O 작업이 함께 존재하는 경우

#### Taskiq가 적합한 경우

- FastAPI 또는 asyncio 중심 프로젝트
- 비동기 DB Driver와 HTTP Client를 Task에서 그대로 사용하려는 경우
- 타입 힌트와 자동완성을 중요하게 보는 경우
- FastAPI 스타일 의존성 주입을 재사용하려는 경우
- Broker와 Middleware를 작은 플러그인 단위로 구성하려는 경우
- 비교적 단순한 Workflow에서 높은 I/O 동시성이 필요한 경우

개인적으로 기존 Django 서비스나 복잡한 Batch Workflow에는 Celery가 안전한 선택이라고 생각합니다. 반대로 새 FastAPI 서비스이고 Task 대부분이 비동기 I/O라면 Taskiq가 코드 구조를 단순하게 만들 수 있습니다.

### 1️⃣2️⃣ 운영 전 공통 체크리스트

어떤 프레임워크를 선택하더라도 다음 항목은 반드시 검토해야 합니다.

1. Task를 여러 번 실행해도 문제가 없도록 멱등성 보장
2. ACK 시점과 Worker 비정상 종료 시 재전달 정책 확인
3. Retry 횟수, Backoff, Jitter 설정
4. 영구 실패 메시지를 보관할 Dead Letter 전략 수립
5. 긴 작업의 Timeout과 강제 종료 정책 설정
6. Result Backend 데이터 만료시간 지정
7. 긴 작업과 짧은 작업의 Queue 분리
8. Worker CPU, 메모리, Queue 적체량 모니터링
9. 배포 시 Worker Graceful Shutdown 확인
10. DB Commit과 작업 메시지 발행 사이의 일관성 검토

특히 "메시지를 한 번만 실행한다"는 가정은 위험합니다. 분산 작업 큐는 장애 복구 과정에서 동일 메시지가 다시 전달될 수 있으므로, DB Unique Key나 상태값 검증 등을 이용해 중복 실행을 안전하게 처리해야 합니다.

### 1️⃣3️⃣ 정리

Celery는 오랜 기간 검증된 기능과 운영 생태계가 강점이고, Taskiq는 asyncio와 타입 힌트를 중심으로 더 자연스러운 비동기 코드를 작성할 수 있다는 점이 강점입니다.

`Django + 복잡한 Workflow + 운영 안정성`이 우선이라면 Celery가 잘 맞고, `FastAPI + async I/O + 타입 친화성`이 우선이라면 Taskiq를 검토할 가치가 있습니다.

결국 선택의 기준은 단순한 처리 속도보다 현재 애플리케이션의 동시성 모델과 팀의 운영 경험이어야 합니다.

### 참고 문서

- [Celery 공식 문서](https://docs.celeryq.dev/en/stable/){:target="_blank"}
- [Celery Concurrency](https://docs.celeryq.dev/en/stable/userguide/concurrency/){:target="_blank"}
- [Celery Configuration](https://docs.celeryq.dev/en/stable/userguide/configuration.html){:target="_blank"}
- [Taskiq 공식 문서](https://taskiq-python.github.io/){:target="_blank"}
- [Taskiq CLI 및 Worker 옵션](https://taskiq-python.github.io/guide/cli.html){:target="_blank"}
- [Taskiq Scheduler](https://taskiq-python.github.io/guide/scheduling-tasks.html){:target="_blank"}
- [Taskiq Redis](https://github.com/taskiq-python/taskiq-redis){:target="_blank"}