---
layout: single
title: "[MSSQL] SQL Server Agent Job Scheduler 사용법"
categories: "db"
tags: ["mssql"]
typora-root-url: ../
description: "SQL Server Agent의 Job, Step, Schedule 구조와 생성, 모니터링, 실패 알림 및 운영 시 주의사항을 정리합니다."
excerpt: "SQL Server Agent Job Scheduler의 구성 요소부터 SSMS와 T-SQL을 이용한 작업 생성, 실행 이력 확인, 보안과 운영 체크리스트까지 정리합니다."
toc: true
toc_sticky: true
header:
  teaser: ../../assets/images/thumbnail/mssql-job-scheduler.jpg
---

![SQL Server Agent Job Scheduler](/assets/images/thumbnail/mssql-job-scheduler.jpg)

MSSQL에서 정해진 시간마다 프로시저를 실행하거나 백업, 데이터 정리, 통계 갱신 같은 작업을 자동화할 때는 보통 **SQL Server Agent**를 사용합니다.

SQL Server Agent는 별도의 애플리케이션 스케줄러가 아니라 SQL Server와 함께 동작하는 서비스입니다. 실행할 작업은 `Job`, 실제 명령은 `Step`, 실행 시점은 `Schedule`로 관리합니다.

## SQL Server Agent란?

SQL Server Agent는 예약된 관리 작업을 실행하는 서비스입니다. 다음과 같은 작업을 자동화할 수 있습니다.

- T-SQL 쿼리 또는 Stored Procedure 실행
- 데이터베이스 백업과 정리
- 인덱스 및 통계 유지보수
- SSIS Package 실행
- PowerShell 또는 운영체제 명령 실행
- 성공 및 실패 이력 기록
- 실패 시 운영자에게 이메일 알림

SQL Server Agent의 작업 정보와 실행 이력은 시스템 데이터베이스인 `msdb`에 저장됩니다.

> SQL Server 설치 직후에는 Agent 서비스가 중지되어 있거나 자동 시작이 비활성화되어 있을 수 있습니다. 작업을 만들기 전에 서비스 상태와 시작 유형을 확인해야 합니다.

## 사용 전 확인 사항

### SQL Server Edition

SQL Server Agent는 Enterprise, Standard, Developer Edition 등에서 사용할 수 있지만 **Express Edition에서는 제공되지 않습니다**. Express Edition이라면 Windows 작업 스케줄러, 애플리케이션 스케줄러 또는 외부 작업 실행기를 사용해야 합니다.

개발 환경에서는 Developer Edition을 사용할 수 있지만 운영 환경에 배포할 수 있는 라이선스는 아니므로 Edition과 라이선스를 함께 확인해야 합니다.

### Agent 서비스 상태

SSMS의 Object Explorer에서 `SQL Server Agent` 노드가 보이는지 확인합니다. Windows에서는 SQL Server Configuration Manager 또는 서비스 관리 화면에서도 확인할 수 있습니다.

- 기본 인스턴스 서비스명: `SQLSERVERAGENT`
- Named Instance 서비스명: `SQLAgent$인스턴스명`

Agent 노드가 보이지 않는다면 Edition, 로그인 권한, Agent 서비스 설치 및 실행 상태를 확인합니다.

## 주요 구성 요소

| 구성 요소 | 역할 |
| --- | --- |
| Job | 자동화할 작업 전체를 정의 |
| Job Step | Job 안에서 순서대로 실행할 개별 명령 |
| Schedule | 일회성, 매일, 매주 등 실행 조건 정의 |
| Job History | Job과 Step의 성공, 실패 및 메시지 기록 |
| Operator | 이메일 등의 알림을 받을 사람이나 그룹 |
| Alert | SQL Server 이벤트나 성능 조건에 대한 자동 반응 |
| Proxy | CmdExec, PowerShell, SSIS Step을 최소 권한 계정으로 실행 |

하나의 Job은 여러 Step을 가질 수 있으며, 각 Step의 성공 또는 실패에 따라 다음 Step으로 이동하거나 Job을 종료할 수 있습니다. 하나의 Job에 여러 Schedule을 연결할 수도 있고 하나의 Schedule을 여러 Job에서 공유할 수도 있습니다.

## SSMS에서 Job 생성하기

1. SSMS Object Explorer에서 `SQL Server Agent`를 펼칩니다.
2. `Jobs`를 마우스 오른쪽 버튼으로 누르고 `New Job...`을 선택합니다.
3. `General`에서 Job 이름, 소유자, 설명을 입력합니다.
4. `Steps`에서 실행할 T-SQL 또는 다른 작업 유형을 추가합니다.
5. `Schedules`에서 실행 주기와 시간을 설정합니다.
6. 필요하다면 `Notifications`에서 실패 알림을 설정합니다.
7. 저장 후 Job을 마우스 오른쪽 버튼으로 눌러 `Start Job at Step...`으로 테스트합니다.

GUI는 빠르게 테스트하기 좋지만 운영 환경에서는 생성 스크립트를 형상 관리하는 편이 변경 이력과 서버 간 배포를 관리하기 쉽습니다.

## T-SQL로 매일 실행되는 Job 만들기

다음 예제는 `AppDB` 데이터베이스의 `dbo.usp_archive_completed_orders` 프로시저를 매일 새벽 2시에 실행합니다.

```sql
USE msdb;
GO

DECLARE @job_id UNIQUEIDENTIFIER;

EXEC dbo.sp_add_job
    @job_name = N'AppDB - 완료 주문 보관',
    @enabled = 1,
    @description = N'완료 주문을 매일 보관 테이블로 이동',
    @job_id = @job_id OUTPUT;

EXEC dbo.sp_add_jobstep
    @job_id = @job_id,
    @step_name = N'보관 프로시저 실행',
    @subsystem = N'TSQL',
    @database_name = N'AppDB',
    @command = N'EXEC dbo.usp_archive_completed_orders;',
    @retry_attempts = 3,
    @retry_interval = 5,
    @on_success_action = 1, -- 성공으로 Job 종료
    @on_fail_action = 2;    -- 실패로 Job 종료

EXEC dbo.sp_add_jobschedule
    @job_id = @job_id,
    @name = N'매일 02시',
    @enabled = 1,
    @freq_type = 4,         -- Daily
    @freq_interval = 1,     -- 1일마다
    @active_start_date = 20260630,
    @active_start_time = 020000;

EXEC dbo.sp_add_jobserver
    @job_id = @job_id,
    @server_name = N'(LOCAL)';
GO
```

`@active_start_time`은 `HHmmss` 형식의 정수입니다. 새벽 2시는 `020000`, 오후 11시 30분은 `233000`으로 설정합니다.

### 주요 Schedule 값

| 값 | 의미 |
| --- | --- |
| `@freq_type = 1` | 한 번 실행 |
| `@freq_type = 4` | 매일 실행 |
| `@freq_type = 8` | 매주 실행 |
| `@freq_type = 16` | 매월 지정한 날짜에 실행 |
| `@freq_type = 64` | SQL Server Agent 시작 시 실행 |
| `@freq_type = 128` | CPU가 유휴 상태일 때 실행 |

매주 실행할 때 `@freq_interval`은 요일을 비트 값으로 조합합니다.

| 요일 | 값 |
| --- | ---: |
| 일요일 | 1 |
| 월요일 | 2 |
| 화요일 | 4 |
| 수요일 | 8 |
| 목요일 | 16 |
| 금요일 | 32 |
| 토요일 | 64 |

예를 들어 월요일부터 금요일까지 실행하려면 `2 + 4 + 8 + 16 + 32 = 62`를 사용합니다.

## 수동 실행과 상태 확인

### Job 즉시 실행

```sql
USE msdb;
GO

EXEC dbo.sp_start_job
    @job_name = N'AppDB - 완료 주문 보관';
GO
```

`sp_start_job` 호출 성공은 작업 시작 요청이 접수되었다는 의미입니다. 실제 Job의 최종 성공 여부는 실행 이력에서 별도로 확인해야 합니다.

### Job 목록 확인

```sql
USE msdb;
GO

SELECT
    job_id,
    name,
    enabled,
    date_created,
    date_modified
FROM dbo.sysjobs
ORDER BY name;
GO
```

### 실행 중인 Job 확인

```sql
USE msdb;
GO

EXEC dbo.sp_help_jobactivity;
GO
```

### 실행 이력 확인

```sql
USE msdb;
GO

EXEC dbo.sp_help_jobhistory
    @job_name = N'AppDB - 완료 주문 보관',
    @mode = N'FULL';
GO
```

`run_status`의 주요 값은 다음과 같습니다.

| 값 | 상태 |
| ---: | --- |
| 0 | 실패 |
| 1 | 성공 |
| 2 | 재시도 |
| 3 | 취소 |
| 4 | 실행 중 |

SSMS에서는 Job을 마우스 오른쪽 버튼으로 누르고 `View History`를 선택하면 Job 전체 결과와 Step별 메시지를 확인할 수 있습니다.

## 재시도와 실패 처리

일시적인 네트워크 오류나 잠금 충돌을 고려하면 Step에 재시도를 설정하는 것이 유용합니다.

```sql
@retry_attempts = 3,
@retry_interval = 5
```

위 설정은 Step 실패 시 5분 간격으로 최대 3회 재시도합니다. 하지만 데이터 오류나 SQL 문법 오류처럼 재시도로 해결되지 않는 문제에는 불필요하게 장애 확인만 늦출 수 있습니다.

Step별로 다음 동작도 명확하게 설정해야 합니다.

- 성공 시 다음 Step 실행
- 성공으로 Job 종료
- 실패 시 특정 Step으로 이동
- 실패로 Job 종료

여러 Step을 사용하는 경우 선행 Step의 부분 성공 결과가 남아도 안전한지 확인해야 합니다.

## 실패 이메일 알림

Job 실패 알림을 사용하려면 다음 구성이 필요합니다.

1. Database Mail Account와 Profile 생성
2. SQL Server Agent 속성의 `Alert System`에서 Database Mail 활성화
3. SQL Server Agent 서비스 재시작
4. 알림 수신용 Operator 생성
5. Job의 `Notifications`에서 실패 시 이메일 전송 설정

`Operator`는 알림 수신자를 뜻하며 `Alert`와는 역할이 다릅니다. 단순히 Job 성공 또는 실패를 통보하려면 Job의 Notification을 사용합니다. 특정 SQL Server 오류 번호나 성능 조건에 반응하려면 Alert를 사용합니다.

## 권한과 Proxy

SQL Server Agent 접근 권한은 `msdb` 데이터베이스의 다음 고정 역할로 관리할 수 있습니다.

- `SQLAgentUserRole`
- `SQLAgentReaderRole`
- `SQLAgentOperatorRole`

`sysadmin` 권한을 무조건 부여하기보다 필요한 역할만 부여하는 것이 좋습니다.

T-SQL Step은 Job 소유자와 `EXECUTE AS` 설정의 영향을 받습니다. PowerShell, CmdExec, SSIS 같은 비 T-SQL Step은 Credential과 Proxy를 사용해 필요한 권한만 부여합니다.

> Job Step에서 운영체제 명령을 실행하기 위해 SQL Server Agent 서비스 계정에 과도한 파일 및 관리자 권한을 부여하지 않는 것이 중요합니다. 작업 용도별 Proxy를 분리하는 편이 안전합니다.

## 운영 환경에서 주의할 점

### 1. 중복 실행에 안전하게 만들기

Job을 수동 실행하거나 장애 복구 과정에서 같은 작업이 다시 요청될 수 있습니다. 처리 대상에 상태값, 고유 키, 처리 일시를 두어 동일 데이터를 다시 처리해도 결과가 깨지지 않도록 설계합니다.

필요하다면 `sp_getapplock` 또는 별도의 실행 상태 테이블을 이용해 동시에 여러 실행 경로가 같은 데이터를 처리하지 못하게 할 수 있습니다.

### 2. 트랜잭션 범위를 짧게 유지하기

대량 데이터를 한 트랜잭션으로 처리하면 잠금, Transaction Log 증가, 복구 시간 문제가 생길 수 있습니다. 처리량이 많다면 일정 건수 단위로 나누고 각 배치의 진행 상태를 기록합니다.

### 3. 실행 시간을 측정하기

평소 5분 걸리던 Job이 40분 걸리기 시작했다면 장애 전조일 수 있습니다. 성공 여부만 확인하지 말고 시작 시각, 종료 시각, 처리 건수, 실행 시간을 함께 모니터링합니다.

### 4. Job History 보존량을 확인하기

Job History에는 전체 행 수와 Job별 행 수 제한이 있습니다. 제한에 도달하면 오래된 이력부터 제거됩니다. SQL Server Agent 속성의 `History` 페이지에서 보존량을 조정하고, 장기 분석이 필요하다면 별도 로그 테이블이나 모니터링 시스템에 저장합니다.

### 5. 서버 시간대를 확인하기

Schedule은 SQL Server가 실행되는 서버의 날짜와 시간을 기준으로 동작합니다. 서버 이전, 시간대 변경, 서머타임 적용 환경에서는 누락 또는 예상과 다른 시각의 실행 가능성을 점검합니다.

### 6. 장애 조치 후 상태를 확인하기

Failover 도중 실행 중이던 Agent Job은 새 노드에서 자동으로 이어서 실행되지 않습니다. 중단된 Job이 시작 상태로만 남거나 일부 Step만 반영될 수 있으므로 재실행 기준과 복구 절차를 준비합니다.

### 7. 작업 정의도 형상 관리하기

SSMS에서만 Job을 만들면 다른 서버에 동일하게 배포하거나 변경 원인을 찾기 어렵습니다. Job, Step, Schedule, Operator 설정을 T-SQL 스크립트로 관리하고 운영 반영 전에 테스트합니다.

## SQL Server Agent와 애플리케이션 스케줄러 선택

| 기준 | SQL Server Agent | 애플리케이션 스케줄러 |
| --- | --- | --- |
| 적합한 작업 | 백업, DB 정리, 프로시저 실행 | 비즈니스 로직, API 호출, 분산 작업 |
| 실행 위치 | SQL Server 인스턴스 중심 | 애플리케이션 또는 Worker |
| 배포 | msdb와 Agent 설정 | 애플리케이션 코드 및 인프라 |
| 모니터링 | SSMS, Job History | APM, 로그, Queue Dashboard |
| 확장성 | DB 관리 작업에 적합 | 다중 Worker와 수평 확장에 유리 |

데이터베이스 내부에서 끝나는 관리 작업은 SQL Server Agent가 단순하고 안정적입니다. 여러 외부 API 호출, 복잡한 비즈니스 흐름, 대규모 병렬 처리가 필요하면 Quartz, Celery, Taskiq 같은 애플리케이션 스케줄러나 작업 큐가 더 적합할 수 있습니다.

## 운영 체크리스트

- SQL Server Agent를 지원하는 Edition인지 확인
- Agent 서비스 자동 시작 및 실행 상태 확인
- Job의 대상 데이터베이스를 명시
- Job 소유자와 Step 실행 권한 확인
- 비 T-SQL Step은 최소 권한 Proxy 사용
- 재시도 횟수와 간격 설정
- 실패 시 Job 종료 상태가 정확히 기록되는지 확인
- Database Mail과 실패 알림 테스트
- 중복 실행과 부분 실패에 안전한 로직 작성
- Job History 보존량과 별도 모니터링 정책 결정
- 서버 시간대와 점검 시간 충돌 확인
- Job 생성 및 변경 스크립트 형상 관리

## 참고 자료

- [SQL Server Agent 개요](https://learn.microsoft.com/en-us/ssms/agent/sql-server-agent)
- [SQL Server Agent Job 생성](https://learn.microsoft.com/en-us/ssms/agent/create-a-job)
- [Job Schedule 생성 및 연결](https://learn.microsoft.com/en-us/ssms/agent/create-and-attach-schedules-to-jobs)
- [SQL Server Agent 보안](https://learn.microsoft.com/en-us/ssms/agent/implement-sql-server-agent-security)
- [Job History 조회](https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-help-jobhistory-transact-sql)
- [Job History Log 설정](https://learn.microsoft.com/en-us/ssms/agent/set-up-the-job-history-log)
- [Database Mail을 이용한 Agent 알림](https://learn.microsoft.com/en-us/sql/relational-databases/database-mail/configure-sql-server-agent-mail-to-use-database-mail)
- [SQL Server Edition별 지원 기능](https://learn.microsoft.com/en-us/sql/sql-server/editions-and-components-of-sql-server-2025)
