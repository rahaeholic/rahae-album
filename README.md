# 라해의 앨범

라해의 기념일마다 사진과 영상을 모으는 공개 앨범입니다.

- [앨범 홈](https://rahaeholic.github.io/rahae-album/)
- [50일 앨범](https://rahaeholic.github.io/rahae-album/albums/50-days/)

## 구조

```text
index.html                # albums.json에서 생성한 앨범 홈
albums.json               # 홈에 공개할 이벤트 목록과 표시 순서
assets/home.css           # 앨범 홈 스타일
scripts/build-home.mjs     # 별도 패키지 설치 없는 정적 홈 생성기
albums/
  50-days/
    index.html            # 해당 이벤트의 사진·영상 페이지
    album.json            # 해당 이벤트의 사진 목록
    album.css
    album.js
    photos/{thumb,view}/
    posters/
    *.mp4
    MUSIC-CREDITS.txt
```

이벤트 페이지와 미디어는 이벤트 폴더 안에서 관리합니다. 기존 50일 앨범의 큰보기, 장면 이동, 영상 재생과 저장은 그대로 사용할 수 있습니다.

## 다음 이벤트 추가

1. `albums/100-days/`, `albums/first-birthday/`처럼 영문 소문자·숫자·하이픈으로 폴더를 만듭니다.
2. 그 안에 이벤트 페이지 `index.html`과 공개할 사진·영상을 넣습니다. 내부 링크는 해당 폴더 기준 상대경로를 사용하고, 홈 링크는 `../../`로 둡니다. 이벤트 페이지 형식은 자유이며 홈 생성기가 미디어를 편집하거나 이벤트 페이지를 만들지는 않습니다.
3. `albums.json`의 `albums` 배열에 아래 형태로 등록합니다. 배열 순서가 홈의 표시 순서입니다. 아직 준비되지 않은 이벤트는 등록하지 않습니다.

```json
{
  "id": "100-days",
  "title": "100일",
  "path": "albums/100-days/",
  "cover": "albums/100-days/photos/cover.webp",
  "width": 1536,
  "height": 2048,
  "alt": "100일을 맞은 라해"
}
```

`width`와 `height`는 실제 표지 이미지의 크기로 입력합니다. 표지는 해당 이벤트 폴더 안에 두고, 원래 비율로 표시됩니다.

4. Node.js로 홈을 다시 생성합니다. 별도 의존성 설치는 필요 없습니다.

```sh
node scripts/build-home.mjs
```

5. 로컬에서 확인한 뒤 커밋하고 `main`에 푸시합니다. GitHub Pages가 저장소 루트를 배포합니다.

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

`http://127.0.0.1:8000/`에서 홈 → 이벤트 → 사진 큰보기와 영상 재생을 확인합니다. 이벤트 페이지와 표지가 없거나 목록 경로가 잘못되면 홈 생성기는 기존 홈을 덮어쓰기 전에 실패합니다. 생성한 `index.html`도 함께 커밋합니다.

## 공개 파일 관리

이 저장소의 파일은 링크를 아는 사람이 다운로드할 수 있습니다. 공개할 최종 사진·영상과 필요한 음원 크레딧만 보관하고, 원본 촬영 자료·개인 메타데이터·인증 정보는 넣지 않습니다. 현재 50일 앨범은 부모 얼굴이 나온 사진을 제외한 공개본을 사용합니다.

홈과 앨범은 외부 CDN이나 실행 시점의 API 없이 정적 파일로 열립니다. 사이트 경로는 저장소를 유지하는 동안 사용하는 주소이며, 저장소나 계정 이름을 바꾸면 Pages 주소도 다시 확인해야 합니다.
