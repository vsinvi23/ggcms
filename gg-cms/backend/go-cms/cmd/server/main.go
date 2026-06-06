package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"go.uber.org/zap"

	analyticssvc "github.com/serenya/go-cms/internal/application/analytics"
	auditsvc "github.com/serenya/go-cms/internal/application/audit"
	authsvc "github.com/serenya/go-cms/internal/application/auth"
	categorysvc "github.com/serenya/go-cms/internal/application/category"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	commentsvc "github.com/serenya/go-cms/internal/application/comment"
	ctsvc "github.com/serenya/go-cms/internal/application/contenttype"
	engagementsvc "github.com/serenya/go-cms/internal/application/engagement"
	enrollmentsvc "github.com/serenya/go-cms/internal/application/enrollment"
	groupsvc "github.com/serenya/go-cms/internal/application/group"
	lpsvc "github.com/serenya/go-cms/internal/application/learningpath"
	personalizationsvc "github.com/serenya/go-cms/internal/application/personalization"
	lessonsvc "github.com/serenya/go-cms/internal/application/lesson"
	notificationsvc "github.com/serenya/go-cms/internal/application/notification"
	oauthsvc "github.com/serenya/go-cms/internal/application/oauth"
	sectionsvc "github.com/serenya/go-cms/internal/application/section"
	settingssvc "github.com/serenya/go-cms/internal/application/settings"
	tagsvc "github.com/serenya/go-cms/internal/application/tag"
	tasksvc "github.com/serenya/go-cms/internal/application/task"
	usersvc "github.com/serenya/go-cms/internal/application/user"
	"github.com/serenya/go-cms/internal/bootstrap"
	mongorepo "github.com/serenya/go-cms/internal/infrastructure/persistence/mongodb"
	pgrepo "github.com/serenya/go-cms/internal/infrastructure/persistence/postgres"
	httpserver "github.com/serenya/go-cms/internal/interfaces/http"
	"github.com/serenya/go-cms/migrations"
	"github.com/serenya/go-cms/pkg/config"
	"github.com/serenya/go-cms/pkg/database"
	jwtpkg "github.com/serenya/go-cms/pkg/jwt"
	"github.com/serenya/go-cms/pkg/logger"
)

func main() {
	// Load .env file (ignore error — file may not exist in production)
	_ = godotenv.Load()

	// Load typed config from environment
	cfg := config.Load()

	// Initialise structured logger.
	// LOG_LEVEL controls verbosity (debug|info|warn|error).
	// LOG_FILE sets the file path; directory is auto-created.
	// Development console output is enabled when GIN_MODE=debug.
	logger.Init(cfg.Server.LogLevel, cfg.Server.LogFile, cfg.Server.GinMode == "debug")

	// ── PostgreSQL ──────────────────────────────────────────────────────────
	pgDB, err := database.NewPostgresDB(&cfg.Database)
	if err != nil {
		logger.Fatal("postgres connection failed", zap.Error(err))
	}

	// Run all SQL migrations from migrations/postgres/*.sql in order.
	// Files use IF NOT EXISTS / ON CONFLICT DO NOTHING so they are idempotent.
	if err := migrations.Run(pgDB.Write); err != nil {
		logger.Fatal("migration failed", zap.Error(err))
	}

	// ── Master admin bootstrap ───────────────────────────────────────────────
	// Reads ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME from config and ensures
	// the admin user exists with the correct group assignment.
	bootstrap.SeedAdmin(pgDB.Write, &cfg.Admin)

	// ── MongoDB ─────────────────────────────────────────────────────────────
	mongoDB, err := database.NewMongoDB(&cfg.MongoDB)
	if err != nil {
		logger.Fatal("mongodb connection failed", zap.Error(err))
	}

	// ── JWT ─────────────────────────────────────────────────────────────────
	jwtManager := jwtpkg.NewManager(&cfg.JWT)

	// ── Repositories (PostgreSQL — read/write split) ─────────────────────
	userRepo := pgrepo.NewUserRepository(pgDB.Write, pgDB.Read)
	groupRepo := pgrepo.NewGroupRepository(pgDB.Write, pgDB.Read)
	categoryRepo := pgrepo.NewCategoryRepository(pgDB.Write, pgDB.Read)
	articleRepo := pgrepo.NewArticleRepository(pgDB.Write, pgDB.Read)
	courseRepo := pgrepo.NewCourseRepository(pgDB.Write, pgDB.Read)
	sectionRepo := pgrepo.NewSectionRepository(pgDB.Write, pgDB.Read)
	lessonRepo := pgrepo.NewLessonRepository(pgDB.Write, pgDB.Read)
	enrollmentRepo := pgrepo.NewEnrollmentRepository(pgDB.Write, pgDB.Read)
	taskRepo := pgrepo.NewTaskRepository(pgDB.Write, pgDB.Read)
	notifRepo := pgrepo.NewNotificationRepository(pgDB.Write, pgDB.Read)
	tagRepo := pgrepo.NewTagRepository(pgDB.Write, pgDB.Read)
	contentReviewRepo := pgrepo.NewContentReviewRepository(pgDB.Write, pgDB.Read)
	contentTypeRepo := pgrepo.NewContentTypeRepository(pgDB.Write, pgDB.Read)
	learningPathRepo := pgrepo.NewLearningPathRepository(pgDB.Write, pgDB.Read)
	appSettingsRepo := pgrepo.NewAppSettingsRepository(pgDB.Write)
	userProfileRepo := pgrepo.NewUserProfileRepository(pgDB.Write, pgDB.Read)

	// ── Repositories (MongoDB) ────────────────────────────────────────────
	commentRepo := mongorepo.NewCommentRepository(mongoDB.Database)
	analyticsRepo := mongorepo.NewAnalyticsRepository(mongoDB.Database)
	auditLogRepo := mongorepo.NewAuditLogRepository(mongoDB.Database)
	reactionRepo := mongorepo.NewReactionRepository(mongoDB.Database)
	highlightRepo := mongorepo.NewHighlightRepository(mongoDB.Database)
	noteRepo := mongorepo.NewNoteRepository(mongoDB.Database)
	favouriteRepo := mongorepo.NewFavouriteRepository(mongoDB.Database)
	workflowEventRepo := mongorepo.NewWorkflowEventRepository(mongoDB.Database)

	// ── Application Services ─────────────────────────────────────────────
	svcs := httpserver.Services{
		Auth:         authsvc.NewService(userRepo, groupRepo, jwtManager),
		OAuth:        oauthsvc.NewService(userRepo, groupRepo, jwtManager, &cfg.OAuth),
		User:         usersvc.NewService(userRepo, groupRepo),
		Group:        groupsvc.NewService(groupRepo, userRepo),
		Category:     categorysvc.NewService(categoryRepo, groupRepo),
		CMS:          cmssvc.NewService(articleRepo, courseRepo, sectionRepo, groupRepo, categoryRepo, workflowEventRepo, userRepo, contentReviewRepo),
		Section:      sectionsvc.NewService(sectionRepo),
		Lesson:       lessonsvc.NewService(lessonRepo),
		Enrollment:   enrollmentsvc.NewService(enrollmentRepo),
		Task:         tasksvc.NewService(taskRepo),
		Notification: notificationsvc.NewService(notifRepo),
		Comment:      commentsvc.NewService(commentRepo),
		Analytics:    analyticssvc.NewService(analyticsRepo),
		Tag:          tagsvc.NewService(tagRepo),
		Reaction:     engagementsvc.NewReactionService(reactionRepo, analyticsRepo),
		Note:         engagementsvc.NewNoteService(noteRepo),
		Favourite:    engagementsvc.NewFavouriteService(favouriteRepo),
		Highlight:    engagementsvc.NewHighlightService(highlightRepo),
		ContentType:  ctsvc.NewService(contentTypeRepo),
		LearningPath:    lpsvc.NewService(learningPathRepo),
		Audit:           auditsvc.NewService(auditLogRepo),
		Settings:        settingssvc.NewService(appSettingsRepo, cfg),
		Personalization: personalizationsvc.NewService(userProfileRepo, articleRepo, courseRepo, enrollmentRepo, tagRepo),
	}

	// ── HTTP Router ───────────────────────────────────────────────────────
	router, err := httpserver.NewRouter(cfg, jwtManager, svcs)
	if err != nil {
		logger.Fatal("failed to build router", zap.Error(err))
	}

	// ── HTTP Server ───────────────────────────────────────────────────────
	srv := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		logger.Info("go-cms server starting", zap.String("port", cfg.Server.Port))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("server error", zap.Error(err))
		}
	}()

	// ── Graceful Shutdown ─────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("shutting down server...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("server forced shutdown", zap.Error(err))
	}
	if err := mongoDB.Client.Disconnect(shutdownCtx); err != nil {
		logger.Error("mongodb disconnect error", zap.Error(err))
	}

	logger.Info("server stopped cleanly")
}
