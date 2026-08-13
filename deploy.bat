@echo off
REM ============================================================================
REM  Blog Desk deploy script  (interactive menu + legacy CLI)
REM
REM  Usage:
REM    deploy.bat                  Interactive menu (default — pick by number)
REM    deploy.bat menu             Same as above
REM    deploy.bat preview [port]   Build + validate + serve
REM    deploy.bat dev [port]       Dev: watch + live reload (Typora save = rebuild)
REM    deploy.bat check            Build + validate only
REM    deploy.bat publish "msg"    Commit and push to origin/main
REM    deploy.bat stop [port]      Stop a running preview server
REM    deploy.bat import "path" [--title T --category C --tags a,b ...]
REM                                Import an article (Yuque / Typora export)
REM    deploy.bat new "title" --category C [--tags a,b] [--slug ...] [--status draft]
REM                                Create a new post and print its path
REM ============================================================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
if "!SCRIPT_DIR:~-1!"=="\" set "SCRIPT_DIR=!SCRIPT_DIR:~0,-1!"

set "MODE=%~1"

REM ---- check Node.js ---------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js was not found in PATH. Install Node.js 20+ and retry.
    exit /b 1
)

REM ---- auto-install deps if missing -----------------------------------------
if not exist "%SCRIPT_DIR%\node_modules" (
    echo ==> Installing dependencies...
    pushd "%SCRIPT_DIR%"
    call npm install
    set "RC=!errorlevel!"
    popd
    if not "!RC!"=="0" (
        echo ERROR: npm install failed.
        exit /b 1
    )
)

REM ---- dispatch --------------------------------------------------------------
if "%MODE%"=="" goto :menu
if /i "%MODE%"=="menu" goto :menu
if /i "%MODE%"=="preview"  goto :preview
if /i "%MODE%"=="check"    goto :check
if /i "%MODE%"=="publish"  goto :publish
if /i "%MODE%"=="stop"     goto :stop
if /i "%MODE%"=="import"   goto :import
if /i "%MODE%"=="new"      goto :new
if /i "%MODE%"=="dev"      goto :dev
goto :usage

:menu
REM Interactive menu lives in Node (robust UTF-8 / CJK handling).
node "%SCRIPT_DIR%\tools\blog-manager\menu.mjs"
goto :end

:preview
set "PORT=%~2"
if "%PORT%"=="" set "PORT=4173"
node "%SCRIPT_DIR%\tools\blog-manager\cli.mjs" preview --port=%PORT%
goto :end

:check
node "%SCRIPT_DIR%\tools\blog-manager\cli.mjs" validate
goto :end

:publish
set "MSG=%~2"
if "%MSG%"=="" set "MSG=Deploy blog updates"
echo.
echo This will commit and push ALL changes to origin/main.
set /p CONFIRM="Continue? [y/N] "
if /i not "!CONFIRM!"=="y" if /i not "!CONFIRM!"=="yes" (
    echo Publish cancelled.
    goto :end
)
node "%SCRIPT_DIR%\tools\blog-manager\cli.mjs" publish --message="%MSG%"
goto :end

:stop
set "PORT=%~2"
if "%PORT%"=="" set "PORT=4173"
node "%SCRIPT_DIR%\tools\blog-manager\cli.mjs" stop --port=%PORT%
goto :end

:import
REM Pass all remaining args straight to the CLI.
shift
set "IMPORT_ARGS="
:import_loop
shift
if "%~1"=="" goto :import_run
set "IMPORT_ARGS=!IMPORT_ARGS! %~1"
goto :import_loop
:import_run
node "%SCRIPT_DIR%\tools\blog-manager\cli.mjs" import!IMPORT_ARGS!
goto :end

:new
REM Create a new post and print its path (open in Typora).
shift
set "NEW_ARGS="
:new_loop
if "%~1"=="" goto :new_run
set NEW_ARGS=!NEW_ARGS! "%~1"
shift
goto :new_loop
:new_run
node "%SCRIPT_DIR%\tools\blog-manager\cli.mjs" new !NEW_ARGS!
goto :end

:dev
REM Dev mode: build once, then watch + live reload until Ctrl+C.
set "PORT=%~2"
if "%PORT%"=="" set "PORT=4173"
node "%SCRIPT_DIR%\tools\blog-manager\cli.mjs" dev --port=%PORT%
goto :end

:usage
echo.
echo Blog Desk deploy script
echo.
echo   deploy.bat                  Interactive menu (pick by number)
echo   deploy.bat menu             Same as above
echo   deploy.bat preview [port]   Build + validate + serve
echo   deploy.bat dev [port]       Dev: watch + live reload (Typora save = rebuild)
echo   deploy.bat check            Build + validate without serving
echo   deploy.bat publish "msg"    Commit and push to origin/main
echo   deploy.bat stop [port]      Stop preview server
echo   deploy.bat import ^<path^>   Import article from Yuque/Typora export
echo   deploy.bat new "title" --category ^<cat^> [--tags a,b] [--slug s]
echo                              Create a new post, then open it in Typora
echo.

:end
endlocal
