package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"go.uber.org/zap"

	aisvc "github.com/serenya/go-cms/internal/application/ai"
	"github.com/serenya/go-cms/internal/infrastructure/llm"
	analyticssvc "github.com/serenya/go-cms/internal/application/analytics"
	auditsvc "github.com/serenya/go-cms/internal/application/audit"
	authsvc "github.com/serenya/go-cms/internal/application/auth"
	identitysvc "github.com/serenya/go-cms/internal/application/identity"
	categorysvc "github.com/serenya/go-cms/internal/application/category"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	commentsvc "github.com/serenya/go-cms/internal/application/comment"
	ctsvc "github.com/serenya/go-cms/internal/application/contenttype"
	domainsvc "github.com/serenya/go-cms/internal/application/domain"
	engagementsvc "github.com/serenya/go-cms/internal/application/engagement"
	assessmentsvc "github.com/serenya/go-cms/internal/application/assessment"
	certificatesvc "github.com/serenya/go-cms/internal/application/certificate"
	enrollmentsvc "github.com/serenya/go-cms/internal/application/enrollment"
	learnevents "github.com/serenya/go-cms/internal/application/learnevents"
	groupsvc "github.com/serenya/go-cms/internal/application/group"
	lpsvc "github.com/serenya/go-cms/internal/application/learningpath"
	lessonsvc "github.com/serenya/go-cms/internal/application/lesson"
	notificationsvc "github.com/serenya/go-cms/internal/application/notification"
	oauthsvc "github.com/serenya/go-cms/internal/application/oauth"
	personalizationsvc "github.com/serenya/go-cms/internal/application/personalization"
	searchsvc "github.com/serenya/go-cms/internal/application/search"
	seosvc "github.com/serenya/go-cms/internal/application/seo"
	sectionsvc "github.com/serenya/go-cms/internal/application/section"
	settingssvc "github.com/serenya/go-cms/internal/application/settings"
	tagsvc "github.com/serenya/go-cms/internal/application/tag"
	tasksvc "github.com/serenya/go-cms/internal/application/task"
	topicsvc "github.com/serenya/go-cms/internal/application/topic"
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
	"github.com/serenya/go-cms/pkg/mailer"
	"github.com/serenya/go-cms/pkg/metrics"
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
	mongoDB, err := database.NewMongoDB(&cfg.MongoDB, &cfg.TLS)
	if err != nil {
		logger.Fatal("mongodb connection failed", zap.Error(err))
	}

	// ── JWT ─────────────────────────────────────────────────────────────────
	jwtManager := jwtpkg.NewManager(&cfg.JWT)

	// ── Mailer ──────────────────────────────────────────────────────────────
	mlr := mailer.New(cfg.Mailer)

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
	topicRepo := pgrepo.NewTopicRepository(pgDB.Write, pgDB.Read)
	domainRepo := pgrepo.NewDomainRepository(pgDB.Write, pgDB.Read)
	contentReviewRepo := pgrepo.NewContentReviewRepository(pgDB.Write, pgDB.Read)
	contentTypeRepo := pgrepo.NewContentTypeRepository(pgDB.Write, pgDB.Read)
	learningPathRepo := pgrepo.NewLearningPathRepository(pgDB.Write, pgDB.Read)
	appSettingsRepo := pgrepo.NewAppSettingsRepository(pgDB.Write)
	userProfileRepo := pgrepo.NewUserProfileRepository(pgDB.Write, pgDB.Read)
	passwordResetRepo := pgrepo.NewPasswordResetTokenRepository(pgDB.Write, pgDB.Read)

	// ── Repositories (MongoDB) ────────────────────────────────────────────
	commentRepo := mongorepo.NewCommentRepository(mongoDB.Database)
	analyticsRepo := mongorepo.NewAnalyticsRepository(mongoDB.Database, cfg.Platform.AnalyticsRawRetentionDays, cfg.Platform.AnalyticsRollupRetentionDays)
	userContentRepo := mongorepo.NewUserContentRepository(mongoDB.Database)
	auditLogRepo := mongorepo.NewAuditLogRepository(mongoDB.Database)
	reactionRepo := mongorepo.NewReactionRepository(mongoDB.Database)
	highlightRepo := mongorepo.NewHighlightRepository(mongoDB.Database)
	noteRepo := mongorepo.NewNoteRepository(mongoDB.Database)
	favouriteRepo := mongorepo.NewFavouriteRepository(mongoDB.Database)
	workflowEventRepo := mongorepo.NewWorkflowEventRepository(mongoDB.Database)

	// ── Application Services ─────────────────────────────────────────────
	settingsSvc := settingssvc.NewService(appSettingsRepo, cfg)
	userAuthRepo := pgrepo.NewUserAuthRepository(pgDB.Write)
	refreshRepo := pgrepo.NewRefreshTokenRepository(pgDB.Write, pgDB.Read)
	identityRepo := pgrepo.NewIdentityRepository(pgDB.Write, pgDB.Read)
	oauthTxRepo := pgrepo.NewOAuthTransactionRepository(pgDB.Write)
	emailTokenRepo := pgrepo.NewEmailTokenRepository(pgDB.Write)
	sessionGuard := identitysvc.NewSessionGuard(userRepo)
	sessions := identitysvc.NewSessions(userRepo, userAuthRepo, refreshRepo, jwtManager, sessionGuard,
		time.Duration(cfg.JWT.RefreshTTLDays)*24*time.Hour)
	// ===== NOTIF/ANALYTICS/SELF-SERVICE (wiring) =====
	pc := cfg.Platform
	statsRepo := pgrepo.NewPlatformStatsRepository(pgDB.Read)
	prefsRepo := pgrepo.NewUserPreferencesRepository(pgDB.Write, pgDB.Read)
	consentRepo := pgrepo.NewConsentRepository(pgDB.Write)
	emailQueueRepo := pgrepo.NewEmailQueueRepository(pgDB.Write)
	userDataRepo := pgrepo.NewUserDataRepository(pgDB.Write)
	analyticsService := analyticssvc.NewService(analyticsRepo, statsRepo, analyticssvc.Config{IPSalt: pc.AnalyticsIPSalt, QueueSize: pc.AnalyticsQueueSize})
	notificationService := notificationsvc.NewService(notifRepo, prefsRepo, emailQueueRepo, userRepo, notificationsvc.Options{
		AppURL: cfg.OAuth.FrontendURL, APIURL: pc.APIBaseURL, MaxAttempt: pc.EmailMaxAttempts,
	})
	selfService := usersvc.NewSelfService(usersvc.SelfDeps{
		Users: userRepo, Groups: groupRepo, Prefs: prefsRepo, Consents: consentRepo, UserData: userDataRepo,
		UserContent: userContentRepo, Analytics: analyticsService, Sessions: sessions, PolicyVersion: pc.ConsentPolicyVersion,
	})
	metricsReg := metrics.New()
	if sqlW, err := pgDB.Write.DB(); err == nil {
		metricsReg.RegisterDBPool("write", sqlW)
	}
	if sqlR, err := pgDB.Read.DB(); err == nil {
		metricsReg.RegisterDBPool("read", sqlR)
	}
	metricsReg.GaugeFunc("analytics_queue_depth", "Analytics events waiting to be persisted.", func() float64 {
		d, _ := analyticsService.QueueStats()
		return float64(d)
	})
	metricsReg.CounterFunc("analytics_events_dropped_total", "Analytics events dropped (queue full or insert failure).", func() float64 {
		_, n := analyticsService.QueueStats()
		return float64(n)
	})
	// ===== END NOTIF/ANALYTICS/SELF-SERVICE (wiring) =====
	notifier := identitysvc.NewNotifier(notificationsvc.NewQueueSender(notificationService), cfg.Auth.Production)
	identitySvc := identitysvc.NewService(userRepo, userAuthRepo, identityRepo, emailTokenRepo, sessions, notifier, cfg.OAuth.FrontendURL)
	svcs := httpserver.Services{
		Auth:            authsvc.NewService(userRepo, userAuthRepo, passwordResetRepo, sessions, identitySvc, notifier, cfg.OAuth.FrontendURL, cfg.Auth.HIBPEnabled, cfg.Auth.LoginReauthWindow,
			authsvc.WithLoginThrottle(identitysvc.NewLoginThrottle(cfg.Auth.LockThreshold, cfg.Auth.LockAccountLimit, cfg.Auth.LockBase, cfg.Auth.LockMax))),
		OAuth:           oauthsvc.NewService(&cfg.OAuth, oauthTxRepo, identitySvc, sessions),
		Session:         sessionGuard,
		User:            usersvc.NewService(userRepo, groupRepo),
		Group:           groupsvc.NewService(groupRepo, userRepo),
		Category:        categorysvc.NewService(categoryRepo, groupRepo, articleRepo),
		CMS:             cmssvc.NewService(articleRepo, courseRepo, sectionRepo, groupRepo, categoryRepo, workflowEventRepo, userRepo, contentReviewRepo, settingsSvc),
		Section:         sectionsvc.NewService(sectionRepo),
		Lesson:          lessonsvc.NewService(lessonRepo),
		Task:            tasksvc.NewService(taskRepo),
		Notification:    notificationService,
		SelfService:     selfService,
		Metrics:         metricsReg,
		Comment:         commentsvc.NewService(commentRepo),
		Analytics:       analyticsService,
		Tag:             tagsvc.NewService(tagRepo),
		Topic:           topicsvc.NewService(topicRepo),
		Domain:          domainsvc.NewService(domainRepo, articleRepo, courseRepo),
		Reaction:        engagementsvc.NewReactionService(reactionRepo, analyticsRepo),
		Note:            engagementsvc.NewNoteService(noteRepo),
		Favourite:       engagementsvc.NewFavouriteService(favouriteRepo),
		Highlight:       engagementsvc.NewHighlightService(highlightRepo),
		ContentType:     ctsvc.NewService(contentTypeRepo),
		LearningPath:    lpsvc.NewService(learningPathRepo),
		Audit:           auditsvc.NewService(auditLogRepo),
		Settings:        settingsSvc,
		Personalization: personalizationsvc.NewService(userProfileRepo, articleRepo, courseRepo, enrollmentRepo, tagRepo, topicRepo,
			personalizationsvc.WithFavourites(favouriteRepo), personalizationsvc.WithReactions(reactionRepo),
			personalizationsvc.WithViews(analyticsService), personalizationsvc.WithPaths(learningPathRepo)),
	}
	// learning-loop:wiring
	llTracker := learnevents.NewTracker(svcs.Analytics)
	llNotifier := learnevents.NewNotifier(svcs.Notification)
	llProgressRepo := pgrepo.NewEnrollmentProgressRepository(pgDB.Write, pgDB.Read)
	llAttemptRepo := pgrepo.NewAssessmentAttemptRepository(pgDB.Write, pgDB.Read)
	svcs.Certificate = certificatesvc.NewService(certificatesvc.Deps{
		Certificates: pgrepo.NewCertificateRepository(pgDB.Write, pgDB.Read),
		Users:        userRepo,
		Courses:      llProgressRepo,
		Tracker:      llTracker,
		Notifier:     llNotifier,
		PublicBase:   cfg.OAuth.FrontendURL,
	})
	svcs.Enrollment = enrollmentsvc.NewService(llProgressRepo, enrollmentsvc.Deps{
		Attempts: llAttemptRepo, Certificates: svcs.Certificate, Paths: learningPathRepo, Tracker: personalizationsvc.WrapTracker(llTracker, svcs.Personalization), Notifier: llNotifier,
	})
	svcs.Assessment = assessmentsvc.NewService(llAttemptRepo, assessmentsvc.Deps{Completion: svcs.Enrollment, Tracker: llTracker})
	// /learning-loop:wiring

	// ai-layer:wiring
	aiRepo := pgrepo.NewAIRepository(pgDB.Write, pgDB.Read)
	aiGateway := aisvc.NewGateway(
		llm.NewAnthropic(llm.AnthropicConfig{APIKey: os.Getenv("ANTHROPIC_API_KEY"), Timeout: 45 * time.Second, MaxRetries: 2}),
		aiRepo, settingsSvc, aiAllowedLinkHosts(cfg.OAuth.FrontendURL))
	svcs.AI = aisvc.NewService(aisvc.Deps{
		Gateway: aiGateway, Content: aisvc.NewCMSReader(svcs.CMS), Catalog: aiRepo, Drafts: aiRepo, Chunks: aiRepo,
		Convos: aiRepo, Moderation: aiRepo, UsageRepo: aiRepo, Settings: settingsSvc, Analytics: svcs.Analytics,
	})
	svcs.Comment = commentsvc.NewServiceWithScreener(commentRepo, aisvc.NewCommentScreener(svcs.AI))
	aiCtx, aiCancel := context.WithCancel(context.Background())
	defer aiCancel()
	aisvc.RunIndexer(aiCtx, svcs.AI, 5*time.Minute)
	// /ai-layer:wiring

	// search-seo:wiring
	svcs.Search = searchsvc.NewService(pgrepo.NewSearchRepository(pgDB.Write, pgDB.Read), searchsvc.WithEventTracker(svcs.Analytics))
	svcs.SEO = seosvc.NewService(pgrepo.NewSEORepository(pgDB.Read), seosvc.Config{BaseURL: siteBaseURL(cfg.OAuth.FrontendURL)})
	// /search-seo:wiring

	// ── HTTP Router ───────────────────────────────────────────────────────
	router, err := httpserver.NewRouter(cfg, jwtManager, svcs)
	if err != nil {
		logger.Fatal("failed to build router", zap.Error(err))
	}

	// ===== NOTIF/ANALYTICS/SELF-SERVICE (background jobs) =====
	bgCtx, bgCancel := context.WithCancel(context.Background())
	defer bgCancel()
	if pc.AnalyticsRollupEnabled {
		analyticsService.StartRollups(bgCtx, time.Hour)
	}
	if pc.EmailWorkerEnabled {
		notificationsvc.NewWorker(notificationService, emailQueueRepo, prefsRepo, pgrepo.NewNotificationLookup(pgDB.Write), statsRepo, mlr, notificationsvc.WorkerConfig{
			Production: cfg.Auth.Production, AppURL: cfg.OAuth.FrontendURL, RetentionDays: pc.EmailRetentionDays,
			NotificationRetentionDays: pc.NotificationRetentionDays, DigestEnabled: pc.DigestEnabled,
		}).Start(bgCtx)
	}
	if pc.MetricsAddr != "" {
		mux := http.NewServeMux()
		mux.Handle("/metrics", metricsReg.Handler())
		go func() {
			ms := &http.Server{Addr: pc.MetricsAddr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
			if err := ms.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				logger.Error("metrics listener failed", zap.Error(err))
			}
		}()
	}
	// ===== END NOTIF/ANALYTICS/SELF-SERVICE (background jobs) =====

	// ── HTTP/HTTPS Server ─────────────────────────────────────────────────
	srv := &http.Server{
		Addr:              ":" + cfg.Server.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		MaxHeaderBytes:    1 << 20,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	if cfg.TLS.Enabled {
		caPool, err := loadCACertPool(cfg.TLS.CAFile)
		if err != nil {
			logger.Fatal("tls: failed to load CA cert pool", zap.Error(err))
		}
		srv.TLSConfig = &tls.Config{
			MinVersion: tls.VersionTLS12,
			ClientAuth: tls.RequireAndVerifyClientCert,
			ClientCAs:  caPool,
			CipherSuites: []uint16{
				tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
				tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
				tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
				tls.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256,
			},
		}
		go func() {
			logger.Info("go-cms HTTPS server starting",
				zap.String("port", cfg.Server.Port),
				zap.String("cert", cfg.TLS.CertFile),
			)
			if err := srv.ListenAndServeTLS(cfg.TLS.CertFile, cfg.TLS.KeyFile); err != nil && err != http.ErrServerClosed {
				logger.Fatal("server error", zap.Error(err))
			}
		}()
	} else {
		go func() {
			logger.Info("go-cms server starting", zap.String("port", cfg.Server.Port))
			if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				logger.Fatal("server error", zap.Error(err))
			}
		}()
	}

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
	bgCancel()
	analyticsService.Close()
	if err := mongoDB.Client.Disconnect(shutdownCtx); err != nil {
		logger.Error("mongodb disconnect error", zap.Error(err))
	}

	logger.Info("server stopped cleanly")
}

func aiAllowedLinkHosts(frontendURL string) []string {
	hosts := []string{"geekgully.com", "www.geekgully.com"}
	if u, err := url.Parse(frontendURL); err == nil && u.Hostname() != "" {
		hosts = append(hosts, u.Hostname())
	}
	return append(hosts, strings.Split(os.Getenv("AI_ALLOWED_LINK_HOSTS"), ",")...)
}

func loadCACertPool(caFile string) (*x509.CertPool, error) {
	pem, err := os.ReadFile(caFile)
	if err != nil {
		return nil, fmt.Errorf("read CA file %q: %w", caFile, err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pem) {
		return nil, fmt.Errorf("parse CA cert from %q", caFile)
	}
	return pool, nil
}
