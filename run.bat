@echo off
rem ---------------------------------------------------------------------------
rem  Mosaicary site - build and run
rem
rem  A menu rather than a wall of npm commands to remember. Double-click it.
rem  The build here is the one that goes up: plain files for GitHub Pages, and
rem  the Worker that answers /api checked by the same command.
rem
rem  It comes back to the menu after every task, including after a failure. A
rem  window that closes on you is one you have to open again to read what it said,
rem  and the thing worth reading is usually the failure.
rem ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"
title Mosaicary - site

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node not found. Install it from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

if "%~1" neq "" goto :run

:menu
cls
echo.
echo   Mosaicary - site
echo   =================
echo.
echo   1  dev      models: front on 5173, Worker on 8787, reloads on save
echo   2  skins    the skins site as it was: front on 5173, old server on 3000
echo   3  build    the files that go on GitHub Pages, into dist\web
echo   4  test     the reader, the rules, the filters, the way in
echo   5  check    types, the page and the Worker
echo   6  install  fetch dependencies
echo   7  fresh    wipe node_modules and dist, then install
echo   8  wipedb   throw away the local models database and files
echo.
echo   0  quit
echo.
set "task="
set "pick="
set /p "pick=  what: "
if "%pick%"=="1" set "task=dev"
if "%pick%"=="2" set "task=skins"
if "%pick%"=="3" set "task=build"
if "%pick%"=="4" set "task=test"
if "%pick%"=="5" set "task=check"
if "%pick%"=="6" set "task=install"
if "%pick%"=="7" set "task=fresh"
if "%pick%"=="8" set "task=wipedb"
if "%pick%"=="0" exit /b 0
if not defined task goto :menu
goto :do

:run
set "task=%~1"

:do
if not exist node_modules if /i not "%task%"=="install" if /i not "%task%"=="fresh" (
  echo.
  echo   No node_modules yet - installing first.
  echo.
  call npm install --no-audit --no-fund || goto :failed
)

echo.
if /i "%task%"=="dev" (
  rem  The local database is brought up to date every time: a migration added
  rem  since the last run would otherwise surface as a missing column mid-click.
  call npm run db:local || goto :failed
  echo.
  echo   Open http://localhost:5173  -  Ctrl+C stops it.
  echo.
  call npm run dev
  goto :done
)
if /i "%task%"=="skins" (
  echo   Open http://localhost:5173  -  Ctrl+C stops it.
  echo.
  call npm run dev:skins
  goto :done
)
if /i "%task%"=="build"   ( call npm run build   || goto :failed & goto :done )
if /i "%task%"=="test"    ( call npm test        || goto :failed & goto :done )
if /i "%task%"=="check"   ( call npm run check   || goto :failed & goto :done )
if /i "%task%"=="install" ( call npm install --no-audit --no-fund || goto :failed & goto :done )
if /i "%task%"=="fresh" (
  echo   Removing node_modules and dist...
  if exist node_modules rmdir /s /q node_modules
  if exist dist rmdir /s /q dist
  call npm install --no-audit --no-fund || goto :failed
  goto :done
)
rem  Deliberately not part of "fresh". node_modules can be fetched again; the
rem  accounts and models in .wrangler\state cannot, and the two do not belong on
rem  one key. The skins site keeps its own database in .data, left alone here.
rem  Asked outside a bracketed block on purpose: inside one, %sure% would be
rem  filled in before the question was asked, and the answer would never be read.
if /i "%task%"=="wipedb" goto :wipedb

echo   No such task: %task%
echo   Use: run.bat [dev^|skins^|build^|test^|check^|install^|fresh^|wipedb]
goto :done

:wipedb
echo   This throws away every local account and model in .wrangler\state.
set "sure="
set /p "sure=  type yes to go on: "
if /i not "%sure%"=="yes" echo   Left alone.
if /i "%sure%"=="yes" if exist .wrangler\state rmdir /s /q .wrangler\state
if /i "%sure%"=="yes" echo   Gone. The next dev makes an empty one.
goto :done

:failed
echo.
echo   ---------------------------------------------------------------
echo   That did not finish. The error is above this line.
echo   ---------------------------------------------------------------
echo.
if not "%~1"=="" exit /b 1
pause
goto :menu

:done
echo.
if not "%~1"=="" goto :bye
echo   Done. Press a key for the menu.
pause >nul
goto :menu

:bye
endlocal
