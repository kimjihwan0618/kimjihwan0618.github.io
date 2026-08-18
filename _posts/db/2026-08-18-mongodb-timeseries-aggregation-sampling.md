---
layout: single
title: "[MongoDB] Aggregation Pipeline으로 시계열 데이터 조회 성능 개선"
categories: "db"
tags: ["mongodb"]
typora-root-url: ../
description: "애플리케이션에서 처리하던 시계열 데이터 샘플링을 MongoDB Aggregation Pipeline으로 옮긴 경험을 정리했다."
excerpt: "Java에서 전체 데이터를 순회하던 구조를 MongoDB Aggregation Pipeline 기반 샘플링으로 개선했다."
toc: true
toc_sticky: true
header:
  teaser: ../../assets/images/thumbnail/mongodb.jpg
---

![MongoDB 시계열 데이터 조회 성능 개선](/assets/images/thumbnail/mongodb.jpg)

### 기존 문제점

설비 시계열 데이터를 조회하는 기능이 있었다. 조회 기간이 길어지면 결과를 보기까지 약 5~10분이 걸렸다.

원인은 MongoDB에서 조회한 전체 데이터를 Java 애플리케이션에서 다시 순회하며 샘플링하던 구조였다. 데이터가 많을수록 전송량과 반복 처리 시간이 함께 증가했다.

### 기존 방식

기존에는 전체 데이터를 조회한 뒤 데이터 수에 따라 애플리케이션에서 샘플링했다.

```java
cursor = MongoHelper.query(vo);

if (count < MAX_SAMPLING) {
    samplingAll(cursor, vo, seriesMap, trendChart);
} else {
    samplingBlock(cursor, vo, seriesMap, trendChart);
}
```

샘플링 과정에서도 커서를 끝까지 순회했다.

```java
while (cursor.hasNext()) {
    DBObject object = cursor.next();
    while (!calculator.calculate(object, vo));
}
```

화면에 필요한 데이터는 일부였지만, 전체 데이터를 애플리케이션으로 가져와 처리한다는 점이 병목이었다.

### 개선 방식

샘플링을 MongoDB의 Aggregation Pipeline에서 처리하도록 변경했다. DB에서 최대 1,000건만 선별한 뒤 애플리케이션으로 반환하는 방식이었다.

먼저 전체 건수를 기준으로 샘플링 간격을 계산했다.

```java
int queryMaxSampling = 1000;

long total = collection.count(
    new BasicDBObject(
        "ts",
        new BasicDBObject("$gte", from).append("$lte", to)
    )
);

int step = (int) Math.ceil((double) total / queryMaxSampling);
```

예를 들어 조회 결과가 100,000건이면 100건마다 1건을 선택했다.

Pipeline은 시간 범위 필터링, 정렬, 순번 생성, 샘플 선택 순으로 구성했다.

```java
List<DBObject> pipeline = new ArrayList<>();

pipeline.add(new BasicDBObject(
    "$match",
    new BasicDBObject(
        "ts",
        new BasicDBObject("$gte", from).append("$lte", to)
    )
));

pipeline.add(new BasicDBObject(
    "$setWindowFields",
    new BasicDBObject("sortBy", new BasicDBObject("ts", 1))
        .append(
            "output",
            new BasicDBObject(
                "rowNumber",
                new BasicDBObject("$documentNumber", new BasicDBObject())
            )
        )
));

pipeline.add(new BasicDBObject(
    "$match",
    new BasicDBObject(
        "$expr",
        new BasicDBObject(
            "$eq",
            List.of(
                new BasicDBObject("$mod", List.of("$rowNumber", step)),
                0
            )
        )
    )
));

pipeline.add(new BasicDBObject(
    "$project",
    new BasicDBObject("rowNumber", 0)
));

pipeline.add(new BasicDBObject("$limit", queryMaxSampling));
```

애플리케이션에서는 선별된 결과만 차트 데이터로 변환했다.

```java
AggregationOutput output = collection.aggregate(pipeline);

for (DBObject trend : output.results()) {
    timestamps.add((Long) trend.get("ts"));
    samplingBySeries(seriesMap, trend, trendChart);
}
```

### 결과

전체 데이터를 애플리케이션으로 전송하고 순회하던 작업이 사라졌다. 반환 데이터도 최대 1,000건으로 제한돼 네트워크 전송량과 Java의 반복 처리 비용이 줄었다. 그 결과 긴 기간의 시계열 조회 성능을 크게 개선할 수 있었다.

다만 이 방식은 일정 간격으로 데이터를 선택하는 균등 샘플링이다. 순간적인 최솟값이나 최댓값이 중요한 차트라면 해당 값이 누락되지 않는지 별도 검증이 필요했다.

또한 `$setWindowFields`와 `$documentNumber`는 MongoDB 5.0 이상에서 사용할 수 있다. 시간 범위 검색과 정렬에 사용하는 `ts` 필드의 인덱스도 함께 확인해야 했다.

```javascript
db.collection.createIndex({ ts: 1 })
```
