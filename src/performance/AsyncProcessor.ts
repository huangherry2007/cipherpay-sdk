import { Logger } from '../monitoring/observability/logger';
import { ErrorHandler, CipherPayError, ErrorType } from '../errors/ErrorHandler';

export interface Job<T = any> {
  id: string;
  type: string;
  data: T;
  priority: 'low' | 'normal' | 'high' | 'critical';
  createdAt: number;
  scheduledFor?: number;
  retryCount: number;
  maxRetries: number;
  timeout: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface JobResult<T = any> {
  jobId: string;
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  retryCount: number;
}

export interface ProcessorConfig {
  maxWorkers: number;
  maxQueueSize: number;
  jobTimeout: number;
  retryDelay: number;
  maxRetries: number;
  enablePriority: boolean;
  enableBatching: boolean;
  batchSize: number;
  batchTimeout: number;
  enableMetrics: boolean;
  enablePersistence: boolean;
  persistencePath?: string;
}

export interface ProcessorMetrics {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  queuedJobs: number;
  activeWorkers: number;
  averageProcessingTime: number;
  throughput: number; // jobs per second
  errorRate: number;
  queueSize: number;
}

export type JobHandler<T = any, R = any> = (job: Job<T>) => Promise<R>;

export class AsyncProcessor {
  private config: ProcessorConfig;
  private jobQueue: Job[] = [];
  private activeWorkers: Map<string, Promise<void>> = new Map();
  private jobHandlers: Map<string, JobHandler> = new Map();
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private metrics: ProcessorMetrics;
  private workerCounter = 0;
  private jobCounter = 0;
  private processingInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;
  private persistenceInterval?: NodeJS.Timeout;

  constructor(config: Partial<ProcessorConfig> = {}) {
    this.config = {
      maxWorkers: 4,
      maxQueueSize: 1000,
      jobTimeout: 30000,
      retryDelay: 5000,
      maxRetries: 3,
      enablePriority: true,
      enableBatching: false,
      batchSize: 10,
      batchTimeout: 1000,
      enableMetrics: true,
      enablePersistence: false,
      ...config
    };

    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
    this.metrics = this.initializeMetrics();

    this.startProcessing();
    this.startMetricsCollection();
    if (this.config.enablePersistence) {
      this.startPersistenceInterval();
    }
  }

  /**
   * Registers a job handler
   */
  registerHandler<T = any, R = any>(jobType: string, handler: JobHandler<T, R>): void {
    this.jobHandlers.set(jobType, handler);
    
    this.logger.info('Job handler registered', {
      jobType,
      handlerCount: this.jobHandlers.size
    });
  }

  /**
   * Submits a job for processing
   */
  async submitJob<T = any>(
    type: string,
    data: T,
    options: {
      priority?: 'low' | 'normal' | 'high' | 'critical';
      scheduledFor?: number;
      timeout?: number;
      maxRetries?: number;
      tags?: string[];
      metadata?: Record<string, any>;
    } = {}
  ): Promise<string> {
    if (this.jobQueue.length >= this.config.maxQueueSize) {
      throw new CipherPayError(
        'Job queue is full',
        ErrorType.RATE_LIMIT_EXCEEDED,
        { queueSize: this.jobQueue.length, maxSize: this.config.maxQueueSize }
      );
    }

    const jobId = `job-${++this.jobCounter}`;
    const job: Job<T> = {
      id: jobId,
      type,
      data,
      priority: options.priority || 'normal',
      createdAt: Date.now(),
      scheduledFor: options.scheduledFor,
      retryCount: 0,
      maxRetries: options.maxRetries || this.config.maxRetries,
      timeout: options.timeout || this.config.jobTimeout,
      tags: options.tags,
      metadata: options.metadata
    };

    this.addJobToQueue(job);
    this.updateMetrics();

    this.logger.debug('Job submitted', {
      jobId,
      type,
      priority: job.priority,
      queueSize: this.jobQueue.length
    });

    return jobId;
  }

  /**
   * Submits multiple jobs for processing
   */
  async submitJobs<T = any>(
    jobs: Array<{
      type: string;
      data: T;
      priority?: 'low' | 'normal' | 'high' | 'critical';
      scheduledFor?: number;
      timeout?: number;
      maxRetries?: number;
      tags?: string[];
      metadata?: Record<string, any>;
    }>
  ): Promise<string[]> {
    const jobIds: string[] = [];
    
    for (const jobData of jobs) {
      const jobId = await this.submitJob(
        jobData.type,
        jobData.data,
        jobData
      );
      jobIds.push(jobId);
    }

    return jobIds;
  }

  /**
   * Gets job status
   */
  getJobStatus(jobId: string): 'queued' | 'processing' | 'completed' | 'failed' | 'not-found' {
    // Check if job is in queue
    if (this.jobQueue.some(job => job.id === jobId)) {
      return 'queued';
    }

    // Check if job is being processed
    if (this.activeWorkers.has(jobId)) {
      return 'processing';
    }

    // In a real implementation, you would check completed/failed job storage
    return 'not-found';
  }

  /**
   * Cancels a job
   */
  cancelJob(jobId: string): boolean {
    const index = this.jobQueue.findIndex(job => job.id === jobId);
    if (index > -1) {
      this.jobQueue.splice(index, 1);
      this.updateMetrics();
      
      this.logger.info('Job cancelled', { jobId });
      return true;
    }
    return false;
  }

  /**
   * Gets processor metrics
   */
  getMetrics(): ProcessorMetrics {
    return { ...this.metrics };
  }

  /**
   * Gets queue statistics
   */
  getQueueStats(): {
    totalJobs: number;
    jobsByPriority: Record<string, number>;
    jobsByType: Record<string, number>;
    averageWaitTime: number;
  } {
    const jobsByPriority: Record<string, number> = {};
    const jobsByType: Record<string, number> = {};
    let totalWaitTime = 0;

    this.jobQueue.forEach(job => {
      jobsByPriority[job.priority] = (jobsByPriority[job.priority] || 0) + 1;
      jobsByType[job.type] = (jobsByType[job.type] || 0) + 1;
      totalWaitTime += Date.now() - job.createdAt;
    });

    return {
      totalJobs: this.jobQueue.length,
      jobsByPriority,
      jobsByType,
      averageWaitTime: this.jobQueue.length > 0 ? totalWaitTime / this.jobQueue.length : 0
    };
  }

  /**
   * Pauses job processing
   */
  pause(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    
    this.logger.info('Job processing paused');
  }

  /**
   * Resumes job processing
   */
  resume(): void {
    if (!this.processingInterval) {
      this.startProcessing();
    }
    
    this.logger.info('Job processing resumed');
  }

  /**
   * Adds job to queue with priority handling
   */
  private addJobToQueue(job: Job): void {
    if (this.config.enablePriority) {
      // Insert based on priority
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      const jobPriority = priorityOrder[job.priority];
      
      let insertIndex = this.jobQueue.length;
      for (let i = 0; i < this.jobQueue.length; i++) {
        const queuePriority = priorityOrder[this.jobQueue[i].priority];
        if (jobPriority < queuePriority) {
          insertIndex = i;
          break;
        }
      }
      
      this.jobQueue.splice(insertIndex, 0, job);
    } else {
      this.jobQueue.push(job);
    }
  }

  /**
   * Starts job processing
   */
  private startProcessing(): void {
    this.processingInterval = setInterval(() => {
      this.processJobs();
    }, 100); // Process every 100ms
  }

  /**
   * Processes jobs from the queue
   */
  private async processJobs(): Promise<void> {
    // Check if we can start new workers
    while (
      this.activeWorkers.size < this.config.maxWorkers &&
      this.jobQueue.length > 0
    ) {
      const job = this.getNextJob();
      if (job) {
        this.startWorker(job);
      }
    }
  }

  /**
   * Gets next job from queue
   */
  private getNextJob(): Job | undefined {
    if (this.jobQueue.length === 0) {
      return undefined;
    }

    // Check for scheduled jobs
    const now = Date.now();
    const readyJobIndex = this.jobQueue.findIndex(job => 
      !job.scheduledFor || job.scheduledFor <= now
    );

    if (readyJobIndex === -1) {
      return undefined;
    }

    return this.jobQueue.splice(readyJobIndex, 1)[0];
  }

  /**
   * Starts a worker for a job
   */
  private async startWorker(job: Job): Promise<void> {
    const workerId = `worker-${++this.workerCounter}`;
    
    const workerPromise = this.processJob(job, workerId);
    this.activeWorkers.set(workerId, workerPromise);

    try {
      await workerPromise;
    } finally {
      this.activeWorkers.delete(workerId);
    }
  }

  /**
   * Processes a single job
   */
  private async processJob(job: Job, workerId: string): Promise<void> {
    const startTime = Date.now();
    
    this.logger.debug('Processing job', {
      jobId: job.id,
      workerId,
      type: job.type,
      priority: job.priority
    });

    try {
      const handler = this.jobHandlers.get(job.type);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.type}`);
      }

      // Execute job with timeout
      const result = await Promise.race([
        handler(job),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Job timeout')), job.timeout);
        })
      ]);

      const duration = Date.now() - startTime;
      
      this.logger.info('Job completed successfully', {
        jobId: job.id,
        workerId,
        type: job.type,
        duration
      });

      this.recordJobResult({
        jobId: job.id,
        success: true,
        data: result,
        duration,
        retryCount: job.retryCount
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Job failed', {
        jobId: job.id,
        workerId,
        type: job.type,
        error: error instanceof Error ? error.message : 'Unknown error',
        retryCount: job.retryCount
      });

      // Handle retry logic
      if (job.retryCount < job.maxRetries) {
        job.retryCount++;
        job.createdAt = Date.now() + this.config.retryDelay;
        this.addJobToQueue(job);
        
        this.logger.info('Job scheduled for retry', {
          jobId: job.id,
          retryCount: job.retryCount,
          maxRetries: job.maxRetries
        });
      } else {
        this.recordJobResult({
          jobId: job.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration,
          retryCount: job.retryCount
        });
      }
    }
  }

  /**
   * Records job result
   */
  private recordJobResult(result: JobResult): void {
    if (result.success) {
      this.metrics.completedJobs++;
    } else {
      this.metrics.failedJobs++;
    }

    this.metrics.averageProcessingTime = 
      (this.metrics.averageProcessingTime + result.duration) / 2;
  }

  /**
   * Starts metrics collection
   */
  private startMetricsCollection(): void {
    if (!this.config.enableMetrics) return;

    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, 5000); // Update every 5 seconds
  }

  /**
   * Updates processor metrics
   */
  private updateMetrics(): void {
    this.metrics.totalJobs = this.metrics.completedJobs + this.metrics.failedJobs;
    this.metrics.queuedJobs = this.jobQueue.length;
    this.metrics.activeWorkers = this.activeWorkers.size;
    this.metrics.queueSize = this.jobQueue.length;
    
    const totalJobs = this.metrics.completedJobs + this.metrics.failedJobs;
    this.metrics.errorRate = totalJobs > 0 ? this.metrics.failedJobs / totalJobs : 0;
    
    // Calculate throughput (jobs per second over last 5 seconds)
    // In a real implementation, you would track this more precisely
    this.metrics.throughput = this.metrics.completedJobs / 5;
  }

  /**
   * Starts persistence interval
   */
  private startPersistenceInterval(): void {
    if (!this.config.enablePersistence) return;

    this.persistenceInterval = setInterval(() => {
      this.saveToPersistence();
    }, 30000); // Save every 30 seconds
  }

  /**
   * Saves processor state to persistence
   */
  private async saveToPersistence(): Promise<void> {
    if (!this.config.persistencePath) return;

    try {
      const data = {
        jobQueue: this.jobQueue,
        metrics: this.metrics,
        timestamp: Date.now()
      };

      // In a real implementation, you would save to file or database
      this.logger.debug('Processor state saved', {
        path: this.config.persistencePath,
        queueSize: this.jobQueue.length
      });
    } catch (error) {
      this.logger.error('Failed to save processor state', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Initializes metrics
   */
  private initializeMetrics(): ProcessorMetrics {
    return {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      queuedJobs: 0,
      activeWorkers: 0,
      averageProcessingTime: 0,
      throughput: 0,
      errorRate: 0,
      queueSize: 0
    };
  }

  /**
   * Closes the processor
   */
  async close(): Promise<void> {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }

    // Wait for active workers to complete
    const activeWorkers = Array.from(this.activeWorkers.values());
    await Promise.allSettled(activeWorkers);

    if (this.config.enablePersistence) {
      await this.saveToPersistence();
    }

    this.logger.info('Async processor closed', {
      completedJobs: this.metrics.completedJobs,
      failedJobs: this.metrics.failedJobs
    });
  }
}

/**
 * Async Processor Manager for managing multiple processors
 */
export class AsyncProcessorManager {
  private static instance: AsyncProcessorManager;
  private processors: Map<string, AsyncProcessor> = new Map();
  private logger: Logger;

  private constructor() {
    this.logger = Logger.getInstance();
  }

  static getInstance(): AsyncProcessorManager {
    if (!AsyncProcessorManager.instance) {
      AsyncProcessorManager.instance = new AsyncProcessorManager();
    }
    return AsyncProcessorManager.instance;
  }

  /**
   * Creates or gets an async processor
   */
  createProcessor(name: string, config?: Partial<ProcessorConfig>): AsyncProcessor {
    if (this.processors.has(name)) {
      return this.processors.get(name)!;
    }

    const processor = new AsyncProcessor(config);
    this.processors.set(name, processor);

    this.logger.info('Async processor created', {
      processorName: name,
      config
    });

    return processor;
  }

  /**
   * Gets an async processor
   */
  getProcessor(name: string): AsyncProcessor | undefined {
    return this.processors.get(name);
  }

  /**
   * Gets all processors
   */
  getAllProcessors(): Map<string, AsyncProcessor> {
    return new Map(this.processors);
  }

  /**
   * Closes all processors
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.processors.values()).map(processor => processor.close());
    await Promise.allSettled(closePromises);
    this.processors.clear();

    this.logger.info('All async processors closed');
  }
} 